/** The launcher's tools for agents: the same service as the screen, with nothing outward and no launch token in what an agent reads. */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { addApp } from 'acryl-launcher'
import { afterEach, describe, expect, it } from 'vitest'
import type { Door } from '../src/door.ts'
import type { Command, Run } from '../src/runner.ts'
import { LauncherService } from '../src/service.ts'
import { LAUNCHER_HELP, LAUNCHER_TOOLS, launcherTools, registerLauncherTools } from '../src/tools.ts'

const roots: string[] = []
afterEach(() => { while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true }) })

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'acryl-launcher-tools-'))
  roots.push(root)
  const home = join(root, '.acryl')
  const commands: Command[] = []
  const calls: Array<{ verb: string, args: unknown }> = []
  const door: Door = {
    call: async (_folder, verb, args) => { calls.push({ verb, args }); return verb === 'plugin-publish' ? { ok: true, value: PLAN } : { ok: true, value: [{ name: 'hello', version: '1', state: 'active' }] } },
    confirmPublish: async () => ({ ok: true }),
  }
  const service = new LauncherService({
    home, appsFolder: join(root, 'ACRYL'),
    runner: (command): Run => { commands.push(command); return { onOutput: () => {}, onEnd: () => {}, stop: () => {} } },
    environment: () => ({}), exists: path => existsSync(path), makeFolder: path => { mkdirSync(path, { recursive: true }) },
    blends: async () => [{ id: 'acrylblends.notes', name: 'Notes', version: '0.1.0', category: 'productivity', description: 'a notes app' }, { id: 'acrylblends.accounting', name: 'Accounting', version: '0.1.0', category: 'finance', description: 'invoices' }],
    door,
  })
  const app = (name: string): string => {
    const folder = join(root, 'ACRYL', name)
    mkdirSync(join(folder, 'node_modules'), { recursive: true })
    writeFileSync(join(folder, 'blend.yaml'), 'id: acrylblends.notes\n')
    addApp(home, { path: folder })
    return folder
  }
  const tool = (name: string) => {
    const found = launcherTools(service).find(definition => definition.name === name)
    if (found === undefined) throw new Error(`no tool ${name}`)
    return (args: Record<string, unknown> = {}) => Promise.resolve().then(() => (found.execute as (args: unknown, exec: { signal: AbortSignal }) => unknown)(args, { signal: new AbortController().signal }))
  }
  return { service, commands, calls, app, tool }
}

const PLAN = { owner: 'o', repo: 'demo', version: '0.1.0', visibility: 'public', license: 'MIT', createsRepository: true, files: ['index.ts'], integrity: 'x', digest: 'd', pullLine: 'npm run acryl -- plugin pull github:o/demo@0.1.0@sha256:d' }

describe('the launcher tools', () => {
  it('are the nine named ones, each with a name the gateway accepts, and the help names every other tool', () => {
    const { service } = setup()
    const names = launcherTools(service).map(definition => definition.name)
    expect(names).toEqual([...LAUNCHER_TOOLS])
    for (const name of names) expect(name).toMatch(/^[a-z][a-z0-9_]{0,63}$/u)
    for (const name of names.filter(name => name !== 'acryl_launcher_help')) expect(LAUNCHER_HELP).toContain(name.replace('acryl_launcher_', '_').replace(/^_(apps|blends|plugins)$/u, name))
  })

  it('answer how to use the launcher, and list apps without the launch token', async () => {
    const { tool, app } = setup()
    expect(await tool('acryl_launcher_help')()).toContain('+ New app')
    app('shop')
    const listed = await tool('acryl_launcher_apps')() as { apps: Array<Record<string, unknown>>, newAppsGoIn: string }
    expect(listed.apps[0]).toMatchObject({ id: 'shop', state: 'stopped', surface: 'web' })
    expect(JSON.stringify(listed)).not.toContain('token')
  })

  it('search the registry, make an app from a starter or a Blend, and start and stop one', async () => {
    const { tool, commands, app } = setup()
    expect((await tool('acryl_launcher_blends')({ query: 'invoice' }) as { blends: Array<{ id: string }> }).blends.map(blend => blend.id)).toEqual(['acrylblends.accounting'])
    await tool('acryl_launcher_new_app')({ name: 'demo' })
    expect(commands[0]?.args).toEqual(['exec', '--yes', 'create-acrylblends@latest', '--', 'demo', 'blank'])
    await expect(tool('acryl_launcher_new_app')({ name: 'second', blend: 'acrylblends.notes', surface: 'desktop' })).rejects.toThrow(/still being made/u)
    await expect(tool('acryl_launcher_new_app')({ name: 'x', surface: 'tui' })).rejects.toThrow(/web or desktop/u)
    app('shop')
    await tool('acryl_launcher_start_app')({ app: 'shop' })
    expect(commands.at(-1)).toMatchObject({ args: ['run', 'dev'] })
    await expect(tool('acryl_launcher_start_app')({ app: 'nope' })).rejects.toThrow(/no app "nope"/u)
  })

  it('list and pull plugins of a running app, and only prepare a publish: nothing is confirmed', async () => {
    const { tool, app, calls } = setup()
    app('shop')
    expect(await tool('acryl_launcher_plugins')({ app: 'shop' })).toEqual({ plugins: [{ name: 'hello', version: '1', state: 'active' }] })
    await tool('acryl_launcher_pull_plugin')({ app: 'shop', source: 'github:a/b@0.1.0' })
    const result = await tool('acryl_launcher_publish_plan')({ app: 'shop', plugin: 'hello', owner: 'o' }) as { plan: unknown, nextStep: string }
    expect(result.plan).toEqual(PLAN)
    expect(result.nextStep).toContain('press Share plugin')
    expect(calls.map(call => call.verb)).toEqual(['plugin-list', 'plugin-pull', 'plugin-list', 'plugin-publish'])
  })
})

describe('registerLauncherTools', () => {
  it('puts each tool in the registry and takes them all out again', () => {
    const { service } = setup()
    const live = new Set<string>()
    const ctx = { acrylTools: { register: (definition: { name: string }) => { live.add(definition.name); return () => { live.delete(definition.name) } } } } as unknown as Context
    const dispose = registerLauncherTools(ctx, service)
    expect([...live]).toEqual([...LAUNCHER_TOOLS])
    dispose()
    expect(live.size).toBe(0)
  })
})
