/**
 * The page socket's owner is chosen by service presence, not by activation timing: routerHttp's hub when the host composes it (the Web adapter
 * claims the prefix), the node server's hub otherwise. A provider that appears after the door, or is removed and restored, moves the route to the
 * live hub with exactly one owner, and the handshake answers 101 in every arrangement.
 */
import { Context } from '@deepseek-ai/cordis'
import { name as routerName, apply as routerApply } from 'acryl-router'
import * as nodeServer from 'acryl-node-server'
import * as routerHttp from 'acryl-router-http'
import * as webServer from 'acryl-web-server'
import WebSocket from 'ws'
import { afterEach, describe, expect, it } from 'vitest'
import { appFolder, removeFolders } from '../harness.ts'
import * as door from '../../src/index.ts'

const apps: Array<{ close(): Promise<void> }> = []
afterEach(async () => {
  while (apps.length > 0) await apps.pop()?.close()
  removeFolders()
})

/** A host with our node server, our webServer port and the door; the real routerHttp is mounted by the test, when it wants it. */
async function start(): Promise<Context & { origin: string }> {
  const root = appFolder()
  const ctx = new Context() as Context & { origin?: string }
  const mount = async (): Promise<void> => {
    await ctx.plugin({ name: routerName, apply: routerApply })
    await ctx.plugin({
      name: 'app-instance',
      apply: (inner) => { inner.effect(function* () { yield inner.reflect.provide('appInstance', { root, name: 'demo' }) }) },
    })
    await ctx.plugin(nodeServer, { port: 0, scan: 0 })
    await ctx.plugin(webServer)
    await ctx.plugin(door)
    const server = ctx.get('nodeServer') as unknown as { url: string } | undefined
    if (server === undefined) throw new Error('the node server did not start')
    ctx.origin = server.url
  }
  await mount()
  apps.push({ close: async () => { await ctx.fiber.dispose() } })
  return ctx as Context & { origin: string }
}

/** One handshake on the door's channel, from the app's own origin: 101 and a ready frame, or the refusal status. */
function handshake(origin: string): Promise<string> {
  return new Promise((resolve) => {
    const socket = new WebSocket(`${origin.replace('http', 'ws')}/api/acryl-door/channel/ws?window=w-1&focused=1`, {
      headers: { origin },
    })
    socket.once('message', (data) => { resolve(String(data).includes('"ready"') ? 'opened' : 'no ready frame'); socket.close() })
    socket.once('unexpected-response', (_request, response) => {
      let body = ''
      response.on('data', (chunk) => { body += String(chunk) })
      response.once('end', () => { resolve(`refused ${String(response.statusCode)} ${body.slice(0, 120)}`) })
    })
    socket.once('error', (error) => { resolve(`error ${error.message}`) })
    setTimeout(() => resolve('timeout'), 4_000)
  })
}

/** The door moves the route on a service event; a client arriving in the same tick retries, as a browser reconnecting would. */
async function opens(origin: string): Promise<string> {
  const answers: string[] = []
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const answer = await handshake(origin)
    if (answer === 'opened') return answer
    answers.push(answer)
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  return `never opened (${answers.slice(-2).join(', ')})`
}

describe('the page socket owner', () => {
  it('answers 101 with the node server hub when no routerHttp exists', async () => {
    const ctx = await start()
    expect(await opens((ctx as unknown as { origin: string }).origin)).toBe('opened')
  })

  it('moves to routerHttp when it activates after the node server, with one owner', async () => {
    const ctx = await start()
    expect(await opens((ctx as unknown as { origin: string }).origin)).toBe('opened')
    const fiber = ctx.plugin(routerHttp)
    await fiber.await()
    expect(await opens((ctx as unknown as { origin: string }).origin)).toBe('opened')
    // A second socket after the move proves one owner remains (a duplicate upgrade claim would have thrown when the move registered it).
    expect(await opens((ctx as unknown as { origin: string }).origin)).toBe('opened')
    await fiber.dispose()
    expect(await opens((ctx as unknown as { origin: string }).origin)).toBe('opened')
  })

  it('answers 101 when routerHttp is present before the door activates', async () => {
    const root = appFolder()
    const ctx = new Context()
    const origin = { value: '' }
    await ctx.plugin({ name: routerName, apply: routerApply })
    await ctx.plugin({
      name: 'app-instance',
      apply: (inner) => { inner.effect(function* () { yield inner.reflect.provide('appInstance', { root, name: 'demo' }) }) },
    })
    await ctx.plugin(nodeServer, { port: 0, scan: 0 })
    await ctx.plugin(webServer)
    const httpFiber = ctx.plugin(routerHttp)
    await httpFiber.await()
    await ctx.plugin(door)
    origin.value = (ctx.get('nodeServer') as unknown as { url: string }).url
    apps.push({ close: async () => { await ctx.fiber.dispose() } })
    expect(await opens(origin.value)).toBe('opened')
  })

  // After a provider is removed and re-provided the steady state answers 101 exactly once. The raw transport dispatches each upgrade request once:
  // a second dispatch (a re-added raw listener) emitted the same request into the hub twice, rejected the first waiter and answered a plain 200.
  it('moves to the node server hub when routerHttp goes away and back when it returns', async () => {
    const ctx = await start()
    const fiber = ctx.plugin(routerHttp)
    await fiber.await()
    const url = (ctx as unknown as { origin: string }).origin
    expect(await opens(url)).toBe('opened')
    await fiber.dispose()
    expect(await opens(url)).toBe('opened')
    const again = ctx.plugin(routerHttp)
    await again.await()
    expect(await opens(url)).toBe('opened')
  })
})
