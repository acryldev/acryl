/**
 * The door as a framework app mounts it: the real `acryl-router` and `acryl-node-server` plugins on a loopback port, an `appInstance` for
 * a temporary app folder, and the door. A test page answers the Host the way a browser does: an event stream opened with the page's
 * headers (`Sec-Fetch-Site: same-origin`, a `Referer` from the app) and answers posted with its `Origin`.
 */

import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { JSDOM } from 'jsdom'
import * as router from 'acryl-router'
import * as nodeServer from 'acryl-node-server'
import * as door from '../src/index.ts'
import { PageChannel, type ChannelSource } from '../src/page/channel.ts'
import type { UiDriver } from '../src/page/driver/driver.ts'
import { doorFilePath } from '../src/host/door-file.ts'

/** Wait for a condition, up to five seconds. */
export async function until(check: () => boolean, what = 'the condition'): Promise<void> {
  for (let at = 0; at < 500; at += 1) {
    if (check()) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error(`timed out waiting for ${what}`)
}

export interface Running {
  readonly ctx: Context
  readonly root: string
  /** The app's origin, e.g. `http://127.0.0.1:51234`. */
  readonly origin: string
  readonly doorFiber: ReturnType<Context['plugin']>
  close(): Promise<void>
}

const roots: string[] = []

/** A fresh app folder. */
export function appFolder(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'acryl-door-')))
  roots.push(root)
  return root
}

export function removeFolders(): void {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
}

/** Start the app with the door. `services` are provided before it (e.g. a fake `extensions`). */
export async function startApp(options: { root?: string; config?: door.Config; services?: Record<string, unknown>; withServer?: boolean } = {}): Promise<Running> {
  const root = options.root ?? appFolder()
  const ctx = new Context()
  ctx.plugin(router)
  ctx.plugin({
    name: 'app-instance',
    apply: (inner: Context) => { inner.effect(function* () { yield inner.reflect.provide('appInstance', { root, name: 'demo' }) }) },
  })
  for (const [name, value] of Object.entries(options.services ?? {})) {
    ctx.plugin({ name: `service-${name}`, apply: (inner: Context) => { inner.effect(function* () { yield inner.reflect.provide(name, value) }) } })
  }
  if (options.withServer !== false) ctx.plugin(nodeServer, { port: 0 })
  const doorFiber = ctx.plugin(door, options.config ?? {})
  // The door is up once it has written its connection file (after the server listens).
  if (options.withServer !== false) await until(() => existsSync(doorFilePath(root)))
  const server = ctx.get('nodeServer') as { port: number } | undefined
  const origin = server === undefined ? '' : `http://127.0.0.1:${String(server.port)}`
  return { ctx, root, origin, doorFiber, close: async () => { await ctx.fiber.dispose() } }
}

/** The headers a browser sends with the app's own page's requests. */
export function pageHeaders(origin: string): Record<string, string> {
  return { origin, referer: `${origin}/`, 'sec-fetch-site': 'same-origin' }
}

/** An `EventSource` for Node: `fetch` with the page's headers, read event by event. */
export function fetchSource(url: string, headers: Record<string, string>): ChannelSource & { readonly opened: Promise<void> } {
  const listeners = new Map<string, Array<(event: MessageEvent) => void>>()
  const controller = new AbortController()
  let state = 0
  let open = (): void => {}
  const opened = new Promise<void>((resolve) => { open = resolve })
  const source = {
    onerror: null as ((event: Event) => void) | null,
    get readyState() { return state },
    opened,
    addEventListener(type: string, listener: (event: MessageEvent) => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener])
    },
    close() { state = 2; controller.abort() },
  }
  void (async () => {
    try {
      const response = await fetch(url, { headers: { ...headers, accept: 'text/event-stream' }, signal: controller.signal })
      if (!response.ok || response.body === null) throw new Error(`stream refused with ${String(response.status)}`)
      state = 1
      open()
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let end: number
        while ((end = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, end)
          buffer = buffer.slice(end + 2)
          let type = 'message'
          const data: string[] = []
          for (const line of block.split('\n')) {
            if (line.startsWith('event: ')) type = line.slice(7)
            else if (line.startsWith('data:')) data.push(line.slice(line.startsWith('data: ') ? 6 : 5))
          }
          for (const listener of listeners.get(type) ?? []) listener({ data: data.join('\n') } as MessageEvent)
        }
      }
    } catch {
      // Closed or refused.
    }
    state = 2
    source.onerror?.(new Event('error'))
  })()
  return source
}

/** Connect a page whose document `driver` drives to the running app. @returns the channel and the stream the first connection opened. */
export function connectPage(app: Running, driver: UiDriver, windowId = 'page-1'): { channel: PageChannel; sources: Array<ReturnType<typeof fetchSource>> } {
  const headers = pageHeaders(app.origin)
  const sources: Array<ReturnType<typeof fetchSource>> = []
  const channel = new PageChannel(driver, {
    windowId,
    focused: () => true,
    base: `${app.origin}/api/acryl-door`,
    createSource: (url) => { const source = fetchSource(url, headers); sources.push(source); return source },
    post: (url, body) => fetch(url, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body }),
  })
  channel.connect()
  return { channel, sources }
}

/** Run the operator client in the app folder. */
export async function operator(root: string, argv: readonly string[]): Promise<{ code: number; out: string; err: string }> {
  const { main } = await import('../src/cli/acryl.ts')
  let out = ''
  let err = ''
  const code = await main(argv, { cwd: root, out: (text) => { out += text }, err: (text) => { err += text } })
  return { code, out, err }
}

/** The DOM classes the driver names (`instanceof`, `new MouseEvent`), taken from one window so they match its document. */
const DOM_GLOBALS = ['Element', 'Node', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLButtonElement', 'MouseEvent', 'KeyboardEvent', 'ClipboardEvent', 'InputEvent', 'Event', 'DataTransfer', 'NodeFilter'] as const

/**
 * A page in Node: a JSDOM window whose DOM classes are the globals while it lives. The server tests run in the Node environment, because
 * Vitest's jsdom environment rewrites `new URL(path, import.meta.url)` to an http URL, which the server's file paths cannot use.
 * @returns the document and the function that removes the globals.
 */
export function domPage(html: string): { document: Document; window: Window; close(): void } {
  const dom = new JSDOM(`<!doctype html><html><head><title>Demo</title></head><body>${html}</body></html>`, { pretendToBeVisual: true })
  const window = dom.window as unknown as Window & Record<string, unknown>
  const host = globalThis as Record<string, unknown>
  const saved = DOM_GLOBALS.map(name => [name, Object.getOwnPropertyDescriptor(host, name)] as const)
  for (const name of DOM_GLOBALS) if (window[name] !== undefined) Object.defineProperty(host, name, { configurable: true, writable: true, value: window[name] })
  return {
    document: window.document,
    window,
    close() {
      for (const [name, descriptor] of saved) {
        if (descriptor === undefined) delete host[name]
        else Object.defineProperty(host, name, descriptor)
      }
      dom.window.close()
    },
  }
}
