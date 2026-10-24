import { request } from 'node:http'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import * as settingsPlugin from 'acryl-settings'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { parseProjectRegistryView, parseProjectRequest, WORKSPACE_PROJECTS_PATH } from '../../src/projects/contract.ts'
import { normalizeProjectFolder, PROJECTS_NAMESPACE, ProjectFolderError, ProjectRegistry, ProjectsSchema } from '../../src/projects/registry.ts'
import { createKeepAlive, projectRoutes } from '../../src/projects/route.ts'
import { serveApi, type ServedApi } from '../serve-api.ts'

const dirs: string[] = []
const contexts: Context[] = []
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()?.fiber.dispose()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function folder(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `acryl-project-${name}-`))
  dirs.push(dir)
  return dir
}

/** The real settings service on a throwaway ACRYL home, and a registry over its `workspace` section. */
async function mount(home = folder('home')): Promise<{ home: string, registry: ProjectRegistry, ctx: Context }> {
  const ctx = new Context()
  contexts.push(ctx)
  ctx.provide('appInstance' as never, { home } as never)
  ctx.plugin(settingsPlugin as never, { filename: '' } as never)
  await new Promise(resolve => setTimeout(resolve, 0))
  const scope = (ctx as unknown as { acrylSettings: { register: (namespace: string, schema: typeof ProjectsSchema) => never } }).acrylSettings.register(PROJECTS_NAMESPACE, ProjectsSchema)
  return { home, registry: new ProjectRegistry(scope), ctx }
}

describe('the project registry', () => {
  it('lists what was added, in order, once each, as canonical folders', async () => {
    const { registry } = await mount()
    const a = folder('a')
    const b = folder('b')
    expect(registry.view()).toMatchObject({ paths: [], adopted: false, current: 'default' })
    await registry.add(a)
    await registry.add(`${b}/`)
    await registry.add(a)
    expect(registry.view().paths).toEqual([a, b])
  })

  it('refuses a path that is not an existing absolute folder, by name', async () => {
    const { registry } = await mount()
    const file = join(folder('f'), 'x.txt')
    writeFileSync(file, 'x')
    await expect(registry.add('relative/dir')).rejects.toThrow(ProjectFolderError)
    await expect(registry.add('/definitely/not/here')).rejects.toThrow(/does not exist/u)
    await expect(registry.add(file)).rejects.toThrow(/not a folder/u)
    expect(registry.view().paths).toEqual([])
    expect(() => normalizeProjectFolder(file)).toThrow(ProjectFolderError)
  })

  it('removes a folder, and removing one that is not listed changes nothing', async () => {
    const { registry } = await mount()
    const a = folder('a')
    const b = folder('b')
    await registry.add(a)
    await registry.add(b)
    expect((await registry.remove(a)).paths).toEqual([b])
    expect((await registry.remove(a)).paths).toEqual([b])
  })

  it('persists in the ACRYL home: a new service on the same home sees the list', async () => {
    const first = await mount()
    const a = folder('a')
    await first.registry.add(a)
    expect(readFileSync(join(first.home, 'acryl-settings.yaml'), 'utf8')).toContain(a)
    await first.ctx.fiber.dispose()
    contexts.pop()
    const second = await mount(first.home)
    expect(second.registry.view().paths).toEqual([a])
  })

  it('takes over pre-existing folders once, skipping ones that are gone, and never again', async () => {
    const { registry } = await mount()
    const a = folder('a')
    const gone = join(tmpdir(), 'acryl-project-never-existed')
    const mine = folder('mine')
    await registry.add(mine)
    expect(await registry.adopt([a, gone, mine])).toMatchObject({ paths: [mine, a], adopted: true })
    expect((await registry.adopt([folder('late')])).paths).toEqual([mine, a])
  })
})

describe('the project registry route', () => {
  let api: ServedApi | undefined
  const keepAlive = createKeepAlive()
  afterEach(async () => { await api?.close(); api = undefined })
  afterAll(() => { keepAlive.stop() })

  async function serve(registry: ProjectRegistry): Promise<{ call: (method: string, body?: unknown, sameOrigin?: boolean) => Promise<{ status: number, json: any }> }> {
    api = await serveApi(projectRoutes(registry, keepAlive, () => {}))
    const { origin, port } = api
    return {
      call: (method, body, sameOrigin = true) => new Promise((resolve, reject) => {
        const text = body === undefined ? undefined : JSON.stringify(body)
        const headers: Record<string, string | number> = sameOrigin ? { origin, 'sec-fetch-site': 'same-origin' } : {}
        if (text !== undefined) { headers['content-type'] = 'application/json'; headers['content-length'] = Buffer.byteLength(text) }
        const req = request({ host: '127.0.0.1', port, path: WORKSPACE_PROJECTS_PATH, method, headers }, (res) => {
          let out = ''
          res.on('data', (chunk: Buffer) => { out += chunk.toString('utf8') })
          res.on('end', () => { resolve({ status: res.statusCode ?? 0, json: JSON.parse(out) }) })
        })
        req.on('error', reject)
        req.end(text)
      }),
    }
  }

  it('reads, adds and removes over same-origin requests, and refuses a foreign origin and an unreasonable request', async () => {
    const { registry } = await mount()
    const { call } = await serve(registry)
    const a = folder('a')
    expect((await call('GET')).json).toMatchObject({ ok: true, view: { paths: [], adopted: false } })
    expect((await call('POST', { op: 'add', path: a })).json).toMatchObject({ ok: true, view: { paths: [a], adopted: false } })
    expect((await call('POST', { op: 'add', path: '/nope/not/here' })).json).toMatchObject({ ok: false, code: 'not-a-folder' })
    expect((await call('POST', { op: 'frobnicate' })).json).toMatchObject({ ok: false, code: 'invalid' })
    expect((await call('POST', { op: 'add', path: a, extra: 1 })).status).toBe(400)
    expect((await call('POST', { op: 'remove', path: a })).json).toMatchObject({ ok: true, view: { paths: [], adopted: false } })
    expect((await call('GET', undefined, false)).status).toBe(403)
    expect((await call('POST', { op: 'add', path: a }, false)).status).toBe(403)
    expect((await call('PUT', {})).status).toBe(405)
  })
})

describe('workspaces in the project registry (spec 043)', () => {
  it('starts with Default holding every folder added before workspaces existed', async () => {
    const home = folder('home')
    const a = folder('a')
    writeFileSync(join(home, 'acryl-settings.yaml'), `workspace:\n  projects:\n    - ${a}\n`)
    const { registry } = await mount(home)
    expect(registry.view()).toEqual({ paths: [a], adopted: false, workspaces: [{ id: 'default', name: 'Default', kind: 'individual', projects: [a] }], current: 'default' })
  })

  it('creates a workspace and shows it; projects added there stay out of Default; switching back shows Default\'s', async () => {
    const { registry } = await mount()
    const a = folder('a')
    const b = folder('b')
    await registry.add(a)
    const created = await registry.createWorkspace({ name: ' Payments ', kind: 'shared' })
    const id = created.current
    expect(created.workspaces.map(workspace => workspace.name)).toEqual(['Default', 'Payments'])
    expect(created.paths).toEqual([])
    await registry.add(b)
    await registry.add(a)
    expect(registry.view().paths).toEqual([b, a])
    expect((await registry.switchWorkspace('default')).paths).toEqual([a])
    expect((await registry.switchWorkspace(id)).paths).toEqual([b, a])
  })

  it('renames, refuses a taken or empty name, and deletes a workspace but never Default', async () => {
    const { registry } = await mount()
    const { current: id } = await registry.createWorkspace({ name: 'One', kind: 'individual' })
    await expect(registry.createWorkspace({ name: 'one', kind: 'individual' })).rejects.toThrow(/already/u)
    await expect(registry.renameWorkspace(id, '  ')).rejects.toThrow(/name/u)
    expect((await registry.renameWorkspace(id, 'Two')).workspaces.map(workspace => workspace.name)).toEqual(['Default', 'Two'])
    await expect(registry.deleteWorkspace('default')).rejects.toThrow(/Default/u)
    const after = await registry.deleteWorkspace(id)
    expect(after.workspaces.map(workspace => workspace.id)).toEqual(['default'])
    expect(after.current).toBe('default')
  })

  it('keeps a remote workspace\'s target, and needs a host for it', async () => {
    const { registry } = await mount()
    await expect(registry.createWorkspace({ name: 'Box', kind: 'remote' })).rejects.toThrow(/host/u)
    const view = await registry.createWorkspace({ name: 'Box', kind: 'remote', remote: { host: ' z370n ', user: 'dev', path: '' } })
    expect(view.workspaces.find(workspace => workspace.id === view.current)).toMatchObject({ kind: 'remote', remote: { host: 'z370n', user: 'dev' } })
  })

  it('persists the workspaces and the shown one in the ACRYL home', async () => {
    const home = folder('home')
    const first = await mount(home)
    const { current } = await first.registry.createWorkspace({ name: 'Kept', kind: 'shared' })
    const second = await mount(home)
    expect(second.registry.view()).toMatchObject({ current, workspaces: [{ id: 'default' }, { name: 'Kept', kind: 'shared' }] })
    expect(readFileSync(join(home, 'acryl-settings.yaml'), 'utf8')).toContain('Kept')
  })
})

describe('the registry contract', () => {
  it('parses only the closed set of requests and a well-formed view', () => {
    expect(parseProjectRequest({ op: 'adopt', paths: ['/a', '/b'] })).toEqual({ op: 'adopt', paths: ['/a', '/b'] })
    expect(() => parseProjectRequest({ op: 'adopt', paths: 'x' })).toThrow(/list/u)
    expect(() => parseProjectRequest({ op: 'add' })).toThrow(/path/u)
    const view = { paths: ['/a'], adopted: true, workspaces: [{ id: 'default', name: 'Default', kind: 'individual', projects: ['/a'] }], current: 'default' }
    expect(parseProjectRegistryView(view)).toEqual(view)
    expect(() => parseProjectRegistryView({ paths: ['/a'], adopted: true })).toThrow(/malformed/u)
    expect(parseProjectRequest({ op: 'create-workspace', name: 'Payments', kind: 'shared' })).toEqual({ op: 'create-workspace', name: 'Payments', kind: 'shared' })
    expect(() => parseProjectRequest({ op: 'create-workspace', name: 'X', kind: 'cloud' })).toThrow(/kind/u)
    expect(parseProjectRequest({ op: 'switch-workspace', id: 'ws-1' })).toEqual({ op: 'switch-workspace', id: 'ws-1' })
    expect(() => parseProjectRegistryView({ paths: [1], adopted: true })).toThrow(/malformed/u)
  })
})
