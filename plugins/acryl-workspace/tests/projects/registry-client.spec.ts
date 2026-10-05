import { describe, expect, it, vi } from 'vitest'
import { createProjectRegistryApi, type ProjectRegistryApi } from '../../src/client/projects/registry-api.ts'
import { adoptLegacyProjects, ProjectRegistryState, type LegacyWorkspaceSource } from '../../src/client/projects/registry-state.ts'
import type { ProjectRegistryView, ProjectRequest } from '../../src/projects/contract.ts'

function memoryApi(initial: ProjectRegistryView = { paths: [], adopted: false }): ProjectRegistryApi & { sent: ProjectRequest[] } {
  let view = initial
  const sent: ProjectRequest[] = []
  return {
    sent,
    load: async () => view,
    send: async (request) => {
      sent.push(request)
      if (request.op === 'add' && !view.paths.includes(request.path)) view = { ...view, paths: [...view.paths, request.path] }
      if (request.op === 'remove') view = { ...view, paths: view.paths.filter(path => path !== request.path) }
      if (request.op === 'adopt' && !view.adopted) view = { paths: [...new Set([...view.paths, ...request.paths])], adopted: true }
      return view
    },
  }
}

describe('the project registry API client', () => {
  const answer = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status })

  it('reads a view, and turns the Host\'s refusal into an error carrying its words', async () => {
    const view = { paths: ['/a'], adopted: true }
    expect(await createProjectRegistryApi(answer(200, { ok: true, view })).load()).toEqual(view)
    await expect(createProjectRegistryApi(answer(400, { ok: false, code: 'not-a-folder', message: '/x does not exist' })).send({ op: 'add', path: '/x' })).rejects.toThrow('/x does not exist')
    await expect(createProjectRegistryApi(answer(500, { error: 'boom' })).load()).rejects.toThrow('HTTP 500')
    await expect(createProjectRegistryApi(answer(200, { ok: true, view: { paths: [1] } })).load()).rejects.toThrow(/malformed/u)
  })

  it('sends a request as same-origin JSON', async () => {
    const calls: Array<{ url: string, init?: RequestInit }> = []
    const api = createProjectRegistryApi(async (url, init) => { calls.push({ url, ...(init === undefined ? {} : { init }) }); return new Response(JSON.stringify({ ok: true, view: { paths: [], adopted: false } })) })
    await api.send({ op: 'remove', path: '/p' })
    expect(calls[0]?.url).toBe('/api/acryl-workspace/projects')
    expect(calls[0]?.init).toMatchObject({ method: 'POST', credentials: 'same-origin' })
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ op: 'remove', path: '/p' })
  })
})

describe('the project registry state', () => {
  it('is not loaded until the Host has answered, then lists, changes and notifies', async () => {
    const state = new ProjectRegistryState(memoryApi())
    const listener = vi.fn()
    state.subscribe(listener)
    expect(state.loaded).toBe(false)
    expect(await state.load()).toEqual({ ok: true })
    expect(state.loaded).toBe(true)
    await state.add('/a')
    await state.add('/b')
    expect(state.paths()).toEqual(['/a', '/b'])
    expect(state.key()).toBe('/a\n/b')
    await state.remove('/a')
    expect(state.paths()).toEqual(['/b'])
    expect(listener.mock.calls.length).toBe(4)   // the first load and each change; an unchanged answer is silent
    await state.add('/b')
    expect(listener.mock.calls.length).toBe(4)
  })

  it('keeps what it knew and says why when the Host refuses', async () => {
    const api = memoryApi()
    const state = new ProjectRegistryState({ ...api, send: async () => { throw new Error('could not be saved') } }, { paths: ['/a'], adopted: false })
    expect(state.loaded).toBe(true)
    expect(await state.add('/b')).toEqual({ ok: false, reason: 'could not be saved' })
    expect(state.paths()).toEqual(['/a'])
  })
})

describe('taking over the projects that were chat workspaces', () => {
  function source(phase: 'pending' | 'ready', paths: string[]): LegacyWorkspaceSource & { ready(next: string[]): void } {
    let snapshot = { phase, items: paths.map(path => ({ path })) }
    const listeners = new Set<() => void>()
    return {
      getSnapshot: () => snapshot,
      subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
      ready: (next) => { snapshot = { phase: 'ready', items: next.map(path => ({ path })) }; for (const listener of [...listeners]) listener() },
    }
  }
  const settle = () => new Promise(resolve => setTimeout(resolve, 0))

  it('waits for the workspace list to be ready, so a list that is still loading never counts as empty', async () => {
    const api = memoryApi()
    const state = new ProjectRegistryState(api)
    await state.load()
    const workspaces = source('pending', [])
    const stop = adoptLegacyProjects(state, workspaces)
    await settle()
    expect(api.sent).toEqual([])
    workspaces.ready(['/old-a', '/old-b'])
    await settle()
    expect(api.sent).toEqual([{ op: 'adopt', paths: ['/old-a', '/old-b'] }])
    expect(state.paths()).toEqual(['/old-a', '/old-b'])
    expect(state.adopted).toBe(true)
    stop()
  })

  it('waits for the registry too, and does nothing when the projects were already taken over', async () => {
    const api = memoryApi({ paths: ['/mine'], adopted: true })
    const state = new ProjectRegistryState(api)
    const stop = adoptLegacyProjects(state, source('ready', ['/old']))
    await settle()
    expect(api.sent).toEqual([])      // not loaded yet
    await state.load()
    await settle()
    expect(api.sent).toEqual([])      // loaded, already adopted
    expect(state.paths()).toEqual(['/mine'])
    stop()
  })
})
