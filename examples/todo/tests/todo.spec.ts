import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { apply as routerApply, name as routerName } from 'acrylblends/cordis/router'
import { apply as stateApply, name as stateName } from 'acrylblends/cordis/state'
import { afterEach, describe, expect, it } from 'vitest'
import * as todo from '../src/index.ts'

const contexts: Context[] = []
const folders: string[] = []
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()?.fiber.dispose()
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

async function boot(file?: string): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  ctx.plugin({ name: routerName, apply: routerApply })
  ctx.plugin({ name: stateName, apply: stateApply })
  ctx.plugin(todo, file === undefined ? {} : { file })
  await settle()
  return ctx
}

const post = (ctx: Context, title: unknown): Promise<Response> =>
  ctx.router.request('/todo/api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }) })

describe('acryl-todo', () => {
  it('creates, completes, lists and deletes', async () => {
    const ctx = await boot()
    const created = await post(ctx, ' buy milk ')
    expect(created.status).toBe(201)
    expect(await created.json()).toEqual({ id: 1, title: 'buy milk', done: false })
    const patched = await ctx.router.request('/todo/api/1', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ done: true }) })
    expect(await patched.json()).toEqual({ id: 1, title: 'buy milk', done: true })
    expect(await (await ctx.router.request('/todo/api')).json()).toEqual([{ id: 1, title: 'buy milk', done: true }])
    expect((await ctx.router.request('/todo/api/1', { method: 'DELETE' })).status).toBe(204)
    expect(await (await ctx.router.request('/todo/api')).json()).toEqual([])
  })

  it('rejects bad input and unknown ids', async () => {
    const ctx = await boot()
    expect((await post(ctx, '')).status).toBe(400)
    expect((await post(ctx, 42)).status).toBe(400)
    expect((await ctx.router.request('/todo/api/9', { method: 'DELETE' })).status).toBe(404)
    expect((await ctx.router.request('/todo/api/9', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{"done":true}' })).status).toBe(404)
  })

  it('serves the page', async () => {
    const ctx = await boot()
    const page = await ctx.router.request('/todo')
    expect(page.headers.get('content-type')).toContain('text/html')
    expect(await page.text()).toContain('EventSource')
  })

  it('sends /todo/ to the page instead of a 404, and leaves the API paths canonical', async () => {
    const ctx = await boot()
    const slash = await ctx.router.request('/todo/')
    expect(slash.status).toBe(301)
    expect(new URL(slash.headers.get('location') ?? '').pathname).toBe('/todo')
    expect((await ctx.router.request('/todo/api/')).status).toBe(301)
    expect((await ctx.router.request('/todo/api/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"title":"x"}' })).status).toBe(404)
  })

  it('exposes the list as a state cell', async () => {
    const ctx = await boot()
    await post(ctx, 'a')
    const response = await ctx.router.request('/api/state/todo.list')
    expect(await response.json()).toEqual({ key: 'todo.list', value: [{ id: 1, title: 'a', done: false }] })
  })

  it('survives a restart: a new context on the same file sees the list', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'acryl-todo-'))
    folders.push(folder)
    const file = join(folder, 'data', 'todos.json')
    const first = await boot(file)
    await post(first, 'persist me')
    await first.fiber.dispose()
    contexts.splice(contexts.indexOf(first), 1)
    const second = await boot(file)
    expect(await (await second.router.request('/todo/api')).json()).toEqual([{ id: 1, title: 'persist me', done: false }])
    expect(await (await post(second, 'next')).json()).toMatchObject({ id: 2 })
  })

  it('refuses to start on a corrupt file and leaves its bytes untouched', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'acryl-todo-'))
    folders.push(folder)
    const file = join(folder, 'todos.json')
    const original = '[{"id":1,"title":"precious","done":false},'
    writeFileSync(file, original)
    const ctx = new Context()
    contexts.push(ctx)
    ctx.plugin({ name: routerName, apply: routerApply })
    ctx.plugin({ name: stateName, apply: stateApply })
    const fiber = ctx.plugin(todo, { file })
    await settle()
    expect(fiber.state).toBe(3) // FAILED
    expect((await ctx.router.request('/todo/api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"title":"x"}' })).status).toBe(404)
    expect(readFileSync(file, 'utf8')).toBe(original)
  })

  it('streams the list and ends the stream when the plugin unloads', async () => {
    const ctx = await boot()
    const response = await ctx.router.request('/todo/events')
    const reader = response.body!.getReader()
    const read = async (): Promise<string> => new TextDecoder().decode((await reader.read()).value)
    expect(await read()).toContain('data: []')
    await post(ctx, 'live')
    expect(await read()).toContain('"title":"live"')
    await ctx.fiber.dispose()
    contexts.splice(contexts.indexOf(ctx), 1)
    expect((await reader.read()).done).toBe(true)
  })
})
