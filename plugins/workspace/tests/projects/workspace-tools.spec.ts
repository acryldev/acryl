/**
 * The agent's workspace tools and the registry's event stream (spec 043 T007): through the real settings service and registry, a real
 * Cordis context with a fake `acrylTools` port that records what was registered, and the stream mounted on the real router over loopback HTTP.
 */
import { request } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import * as settingsPlugin from 'acryl-settings'
import type { AcrylToolCall, AcrylToolDecision } from 'acryl-control'
import { afterEach, describe, expect, it } from 'vitest'
import { WORKSPACE_PROJECTS_EVENTS_PATH, parseProjectRegistryView } from '../../src/projects/contract.ts'
import { createKeepAlive, projectRoutes } from '../../src/projects/route.ts'
import { PROJECTS_NAMESPACE, ProjectRegistry, ProjectsSchema } from '../../src/projects/registry.ts'
import {
  WORKSPACE_ADD_PROJECT_TOOL, WORKSPACE_CREATE_TOOL, WORKSPACE_LIST_TOOL, WORKSPACE_SWITCH_TOOL, registerWorkspaceTools, type WorkspacesValue,
} from '../../src/projects/tools.ts'
import { serveMounted, type ServedApi } from '../serve-api.ts'

const dirs: string[] = []
const contexts: Context[] = []
const servers: ServedApi[] = []
afterEach(async () => {
  for (const server of servers.splice(0)) await server.close()
  while (contexts.length > 0) await contexts.pop()?.fiber.dispose()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function folder(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `acryl-ws-tools-${name}-`))
  dirs.push(dir)
  return dir
}

type Tool = { name: string, execute: (args: unknown, exec: { signal: AbortSignal }) => Promise<unknown> | unknown }
type Policy = (exec: AcrylToolCall, next: () => Promise<AcrylToolDecision>) => Promise<AcrylToolDecision>

async function mount() {
  const ctx = new Context()
  contexts.push(ctx)
  ctx.provide('appInstance' as never, { home: folder('home') } as never)
  ctx.plugin(settingsPlugin as never, { filename: '' } as never)
  await new Promise(resolve => setTimeout(resolve, 0))
  const scope = (ctx as unknown as { acrylSettings: { register: (namespace: string, schema: typeof ProjectsSchema) => never } }).acrylSettings.register(PROJECTS_NAMESPACE, ProjectsSchema)
  const registry = new ProjectRegistry(scope)
  const tools = new Map<string, Tool>()
  const policies: Policy[] = []
  ;(ctx as unknown as { acrylTools: unknown }).acrylTools = {
    register: (tool: Tool) => { tools.set(tool.name, tool); return () => { tools.delete(tool.name) } },
    policy: (handler: Policy) => { policies.push(handler); return () => { policies.splice(policies.indexOf(handler), 1) } },
  }
  const dispose = registerWorkspaceTools(ctx, registry)
  const call = async (name: string, args: unknown = {}): Promise<WorkspacesValue> => {
    const tool = tools.get(name)
    if (tool === undefined) throw new Error(`no tool ${name}`)
    return await tool.execute(args, { signal: new AbortController().signal }) as WorkspacesValue
  }
  const decide = (name: string, args: unknown): Promise<AcrylToolDecision> =>
    policies.reduceRight<() => Promise<AcrylToolDecision>>((next, policy) => () => policy({ name, arguments: args }, next), async () => ({ kind: 'allow' }) as AcrylToolDecision)()
  return { registry, tools, call, decide, dispose }
}

describe('the workspace tools', () => {
  it('list, create, switch and add a project through the registry the sidebar uses', async () => {
    const { call } = await mount()
    expect((await call(WORKSPACE_LIST_TOOL)).current).toBe('default')
    const created = await call(WORKSPACE_CREATE_TOOL, { name: 'Payments', kind: 'shared' })
    const payments = created.workspaces.find(workspace => workspace.name === 'Payments')
    expect(payments?.kind).toBe('shared')
    expect(created.current).toBe(payments?.id)
    const project = folder('repo')
    const added = await call(WORKSPACE_ADD_PROJECT_TOOL, { path: project })
    expect(added.workspaces.find(workspace => workspace.id === payments?.id)?.projects).toHaveLength(1)
    expect((await call(WORKSPACE_SWITCH_TOOL, { id: 'default' })).current).toBe('default')
  })

  it('refuses what the registry refuses, with its words', async () => {
    const { call } = await mount()
    await expect(call(WORKSPACE_SWITCH_TOOL, { id: 'nope' })).rejects.toThrow()
    await expect(call(WORKSPACE_CREATE_TOOL, { name: 'X', kind: 'cloud' })).rejects.toThrow(/unknown workspace kind/)
    await expect(call(WORKSPACE_CREATE_TOOL, { name: 'Box', kind: 'remote' })).rejects.toThrow()
  })

  it('asks before creating a workspace or adding a project, not before listing or switching', async () => {
    const { decide } = await mount()
    expect(await decide(WORKSPACE_CREATE_TOOL, { name: 'Payments' })).toEqual({ kind: 'ask', reason: 'Create the workspace "Payments" (individual) and show it' })
    expect(await decide(WORKSPACE_ADD_PROJECT_TOOL, { path: '/p/x' })).toEqual({ kind: 'ask', reason: 'Add the folder /p/x to the workspace "Default"' })
    expect((await decide(WORKSPACE_SWITCH_TOOL, { id: 'default' })).kind).toBe('allow')
    expect((await decide(WORKSPACE_LIST_TOOL, {})).kind).toBe('allow')
  })

  it('takes its tools and its policy away on disposal', async () => {
    const { tools, decide, dispose } = await mount()
    dispose()
    expect(tools.size).toBe(0)
    expect((await decide(WORKSPACE_CREATE_TOOL, { name: 'x' })).kind).toBe('allow')
  })
})

describe('the registry event stream', () => {
  it('sends the view on connect and after every change, and ends the stream when the mount is removed', async () => {
    const { registry, call } = await mount()
    const keepAlive = createKeepAlive()
    const server = await serveMounted(projectRoutes(registry, keepAlive, () => {}))
    servers.push(server)
    const { origin } = server
    const views: string[] = []
    let ended = false
    await new Promise<void>((resolve) => {
      request(`${origin}${WORKSPACE_PROJECTS_EVENTS_PATH}`, { headers: { 'sec-fetch-site': 'same-origin', referer: `${origin}/` } }, (res) => {
        expect(res.headers['content-type']).toBe('text/event-stream')
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => {
          for (const message of chunk.split('\n\n')) if (message.startsWith('data: ')) views.push(parseProjectRegistryView(JSON.parse(message.slice(6))).current)
          resolve()
        })
        res.on('end', () => { ended = true })
      }).end()
    })
    await call(WORKSPACE_CREATE_TOOL, { name: 'Payments' })
    await until(() => views.length === 2)
    expect(views[0]).toBe('default')
    expect(views[1]).not.toBe('default')
    // What the plugin's unload does: the router ends the stream its code produced.
    server.unmount()
    await until(() => ended)
    keepAlive.stop()
  })
})

async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 200; i += 1) {
    if (check()) return
    await new Promise(resolve => { setTimeout(resolve, 10) })
  }
  throw new Error('timed out')
}
