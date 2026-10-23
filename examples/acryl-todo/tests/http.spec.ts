/** The todo app over a real socket, restarted: the same file, a new server, the list is still there. */
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { apply as routerApply, name as routerName } from 'acryl-router'
import { serve } from 'acryl-router-http'
import { apply as stateApply, name as stateName } from 'acryl-state'
import { describe, expect, it } from 'vitest'
import * as todo from '../src/index.ts'

async function start(file: string): Promise<{ origin: string, stop: () => Promise<void> }> {
  const ctx = new Context()
  ctx.plugin({ name: routerName, apply: routerApply })
  ctx.plugin({ name: stateName, apply: stateApply })
  ctx.plugin(todo, { file })
  await new Promise(resolve => setTimeout(resolve, 0))
  const server: Server = createServer((req, res) => { void serve(ctx.router, req, res) })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
  return { origin, stop: async () => { await ctx.fiber.dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) } }
}

describe('acryl-todo over HTTP', () => {
  it('serves CRUD to a loopback client and keeps the list across a server restart', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'acryl-todo-http-'))
    try {
      const file = join(folder, 'todos.json')
      const first = await start(file)
      const created = await fetch(`${first.origin}/todo/api`, { method: 'POST', headers: { 'content-type': 'application/json', origin: first.origin }, body: JSON.stringify({ title: 'over the wire' }) })
      expect(created.status).toBe(201)
      await first.stop()

      const second = await start(file)
      // A plain script (no Origin header) can change the list; a browser page from another origin cannot.
      const curl = await fetch(`${second.origin}/todo/api`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"title":"from curl"}' })
      expect(curl.status).toBe(201)
      const listed = await fetch(`${second.origin}/todo/api`)
      expect(await listed.json()).toEqual([{ id: 1, title: 'over the wire', done: false }, { id: 2, title: 'from curl', done: false }])
      const foreign = await fetch(`${second.origin}/todo/api`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://evil.example' }, body: '{"title":"x"}' })
      expect(foreign.status).toBe(403)
      await second.stop()
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  })
})
