/**
 * The desktop shell's side of the door: the app's windows and menu, for an agent that drives the app (`acryl window list|open|focus|close|resize`, `acryl menu list|click`).
 *
 * The door lives in the app's server, which is this process when `npm run desktop` started it and another one when the window attached to `npm run dev`; so the shell
 * reaches the door the way a page does, over HTTP: it reads `.acryl/door.json` (the address and this run's secret), opens an event stream, answers each call by POST, and
 * opens the stream again when the server restarts. Nothing here imports electron: `main.ts` passes in what Electron offers ({@link DesktopPort}), so the handler is tested
 * without it. The door is development only; with no `.acryl/door.json` this keeps looking and does nothing else.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** A window as Electron has it, the part this file uses. */
export interface WindowPort {
  readonly id: number
  getTitle(): string
  getURL(): string
  isFocused(): boolean
  isMinimized(): boolean
  getSize(): number[]
  getPosition(): number[]
  restore(): void
  focus(): void
  close(): void
  setSize(width: number, height: number): void
}

/** A menu item as Electron has it. */
export interface MenuItemPort {
  readonly label: string
  readonly enabled: boolean
  readonly visible: boolean
  readonly type: string
  /** Electron's role of the item (`quit`, `close`, ...). */
  readonly role?: string | undefined
  readonly submenu?: { readonly items: readonly MenuItemPort[] } | null | undefined
  click(): void
}

export interface DesktopPort {
  /** Every window, in Electron's order. */
  windows(): readonly WindowPort[]
  /** A new window on a path of the app (the page is not awaited). @returns the window. */
  open(path: string | undefined): WindowPort
  /** The application menu's items, or none when the app has no menu. */
  menu(): readonly MenuItemPort[]
}

/** The door's side of a call, as `plugins/acryl-door/src/shell/protocol.ts` defines it. */
export type ShellRequest =
  | { readonly op: 'window-list' }
  | { readonly op: 'window-open'; readonly path?: string }
  | { readonly op: 'window-focus'; readonly id: number }
  | { readonly op: 'window-close'; readonly id: number; readonly force?: boolean }
  | {
      readonly op: 'window-resize'
      readonly id: number
      readonly width: number
      readonly height: number
    }
  | { readonly op: 'menu-list' }
  | { readonly op: 'menu-click'; readonly path: string; readonly force?: boolean }

export type ShellResult =
  | {
      readonly windows: readonly {
        id: number
        title: string
        path: string
        focused: boolean
        width: number
        height: number
        x?: number
        y?: number
      }[]
    }
  | { readonly items: readonly { path: string; label: string; enabled: boolean; ends?: boolean }[] }
  | { readonly ok: true; readonly detail: string; readonly id?: number }

/** A refusal with a code the door passes on to the agent. */
export class ShellRefusal extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = 'ShellRefusal'
  }
}

/** The path and query a window shows, never its origin. */
function pathOf(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.pathname}${parsed.search}`
  } catch {
    return ''
  }
}

/** The menu as paths (`File>New Note`), submenus in order, separators and hidden items left out. */
export function menuPaths(
  items: readonly MenuItemPort[],
  prefix = '',
): { path: string; label: string; enabled: boolean; item: MenuItemPort }[] {
  const found: { path: string; label: string; enabled: boolean; item: MenuItemPort }[] = []
  for (const item of items) {
    if (item.type === 'separator' || !item.visible || item.label === '') continue
    const path = prefix === '' ? item.label : `${prefix}>${item.label}`
    const children = item.submenu?.items ?? []
    if (children.length > 0) found.push(...menuPaths(children, path))
    else found.push({ path, label: item.label, enabled: item.enabled, item })
  }
  return found
}

/** Whether pressing this item ends the desktop app: Quit always, Close Window when it is the last window. */
function endsApp(item: MenuItemPort, windows: number): boolean {
  return item.role === 'quit' || (item.role === 'close' && windows <= 1)
}

/** Answer one call of the door. @throws ShellRefusal for what the app cannot do (no such window, the last window, a disabled item). */
export function handleShellCall(request: ShellRequest, desktop: DesktopPort): ShellResult {
  const windowById = (id: number): WindowPort => {
    const found = desktop.windows().find((window) => window.id === id)
    if (found === undefined) {
      const ids = desktop.windows().map((window) => String(window.id))
      throw new ShellRefusal(
        'no-such-window',
        `there is no window ${String(id)}${ids.length === 0 ? ' (no window is open)' : `; the windows are ${ids.join(', ')}`}`,
      )
    }
    return found
  }
  switch (request.op) {
    case 'window-list':
      return {
        windows: desktop.windows().map((window) => {
          const [width = 0, height = 0] = window.getSize()
          const [x = 0, y = 0] = window.getPosition()
          return {
            id: window.id,
            title: window.getTitle(),
            path: pathOf(window.getURL()),
            focused: window.isFocused(),
            width,
            height,
            x,
            y,
          }
        }),
      }
    case 'window-open': {
      const window = desktop.open(request.path)
      return {
        ok: true,
        detail: `opened window ${String(window.id)} on ${request.path ?? '/'}`,
        id: window.id,
      }
    }
    case 'window-focus': {
      const window = windowById(request.id)
      if (window.isMinimized()) window.restore()
      window.focus()
      return { ok: true, detail: `focused window ${String(window.id)}`, id: window.id }
    }
    case 'window-close': {
      const window = windowById(request.id)
      // The door refuses this first; the shell does not rely on it, because the last window ends the desktop app.
      if (desktop.windows().length === 1 && request.force !== true) {
        throw new ShellRefusal(
          'last-window',
          `window ${String(window.id)} is the app's last window: closing it ends the desktop app. Open another window first, or pass force to end it on purpose`,
        )
      }
      window.close()
      return { ok: true, detail: `closed window ${String(window.id)}`, id: window.id }
    }
    case 'window-resize': {
      const window = windowById(request.id)
      window.setSize(request.width, request.height)
      return {
        ok: true,
        detail: `window ${String(window.id)} is now ${String(request.width)}x${String(request.height)}`,
        id: window.id,
      }
    }
    case 'menu-list':
      return {
        items: menuPaths(desktop.menu()).map(({ path, label, enabled, item }) => ({
          path,
          label,
          enabled,
          ...(endsApp(item, desktop.windows().length) ? { ends: true } : {}),
        })),
      }
    case 'menu-click': {
      const wanted = request.path
        .split('>')
        .map((label) => label.trim())
        .join('>')
      const found = menuPaths(desktop.menu()).find((entry) => entry.path === wanted)
      if (found === undefined)
        throw new ShellRefusal(
          'no-such-menu-item',
          `the menu has no item ${JSON.stringify(wanted)}; menu list prints the paths`,
        )
      if (!found.enabled) throw new ShellRefusal('disabled', `${found.path} is disabled`)
      // Quit, or Close Window on the last window, ends the desktop app: an agent must not end the session it works in by accident.
      if (endsApp(found.item, desktop.windows().length) && request.force !== true) {
        throw new ShellRefusal(
          'quits-app',
          `${found.path} ends the desktop app${found.item.role === 'close' ? ' (it is the last window)' : ''}. Pass force to do it on purpose`,
        )
      }
      found.item.click()
      return { ok: true, detail: `pressed ${found.path}` }
    }
  }
}

export interface DoorShellDeps {
  readonly desktop: DesktopPort
  readonly fetch?: typeof fetch
  readonly read?: (file: string) => string
  /** Milliseconds to wait before looking for the door again; grows to `maxDelayMs`. */
  readonly retryMs?: number
  readonly maxDelayMs?: number
  readonly log?: (message: string) => void
}

interface DoorLocation {
  readonly url: string
  readonly secret: string
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]'])

/** Where the door is now: its address and this run's secret, from `.acryl/door.json` (read again on every connection: a restarted server has a new secret). */
export function findDoor(
  root: string,
  read: (file: string) => string = (file) => readFileSync(file, 'utf8'),
): DoorLocation | undefined {
  try {
    const file = JSON.parse(read(join(root, '.acryl', 'door.json'))) as {
      url?: unknown
      secret?: unknown
    }
    if (typeof file.url !== 'string' || typeof file.secret !== 'string' || file.secret === '')
      return undefined
    const parsed = new URL(file.url)
    if (parsed.protocol !== 'http:' || !LOOPBACK.has(parsed.hostname)) return undefined
    return { url: parsed.origin, secret: file.secret }
  } catch {
    return undefined
  }
}

/** Server-sent events from a response body: `{ event, data }` per block. */
async function* events(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<{ event: string; data: string }> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return
      buffer += decoder.decode(value, { stream: true })
      for (let end = buffer.indexOf('\n\n'); end !== -1; end = buffer.indexOf('\n\n')) {
        const block = buffer.slice(0, end)
        buffer = buffer.slice(end + 2)
        let event = 'message'
        const data: string[] = []
        for (const line of block.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim()
          else if (line.startsWith('data:'))
            data.push(line.slice(line.startsWith('data: ') ? 6 : 5))
        }
        yield { event, data: data.join('\n') }
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}

/**
 * Keep the shell connected to the door of the app in `root` until the returned function is called. The door is found again after each loss, so a dev server that restarts (a
 * change of `src/`) is followed. Each call is answered with its result, or with the refusal's code and message.
 */
export function startDoorShell(root: string, deps: DoorShellDeps): () => void {
  const request = deps.fetch ?? fetch
  const retry = deps.retryMs ?? 500
  const maxDelay = deps.maxDelayMs ?? 5000
  const controller = new AbortController()
  let wait: NodeJS.Timeout | undefined
  const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      wait = setTimeout(resolve, ms)
      controller.signal.addEventListener(
        'abort',
        () => {
          clearTimeout(wait)
          resolve()
        },
        { once: true },
      )
    })

  const answer = async (door: DoorLocation, body: unknown): Promise<void> => {
    await request(`${door.url}/api/acryl-door/shell/answer`, {
      method: 'POST',
      headers: { authorization: `Bearer ${door.secret}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    }).catch(() => undefined)
  }

  const serve = async (door: DoorLocation): Promise<void> => {
    const response = await request(`${door.url}/api/acryl-door/shell/events`, {
      headers: { authorization: `Bearer ${door.secret}`, accept: 'text/event-stream' },
      signal: controller.signal,
    })
    if (!response.ok || response.body === null)
      throw new Error(`the door answered ${String(response.status)}`)
    for await (const { event, data } of events(response.body)) {
      if (event !== 'call') continue
      let call: { id?: unknown; request?: ShellRequest }
      try {
        call = JSON.parse(data) as { id?: unknown; request?: ShellRequest }
      } catch {
        continue
      }
      if (typeof call.id !== 'number' || call.request === undefined) continue
      try {
        await answer(door, {
          t: 'result',
          id: call.id,
          value: handleShellCall(call.request, deps.desktop),
        })
      } catch (cause) {
        const refusal =
          cause instanceof ShellRefusal
            ? cause
            : new ShellRefusal(
                'failed',
                cause instanceof Error ? cause.message : 'the shell could not do that',
              )
        await answer(door, {
          t: 'error',
          id: call.id,
          code: refusal.code,
          message: refusal.message,
        })
      }
    }
  }

  void (async () => {
    let delay = retry
    let announced = false
    while (!controller.signal.aborted) {
      const door = findDoor(root, deps.read)
      if (door !== undefined) {
        try {
          if (!announced)
            deps.log?.(
              'desktop: windows and menu are available to the door (acryl window list, acryl menu list)',
            )
          announced = true
          await serve(door)
          delay = retry
        } catch {
          // The server restarted or is not up yet: look again.
        }
      }
      await sleep(delay)
      delay = Math.min(delay * 2, maxDelay)
    }
  })()
  return () => {
    controller.abort()
  }
}
