/**
 * Real-engine proof for the Extension Context Pack (spec 037): the web engine
 * mounts the plugin, the assembled system prompt carries the docs router with
 * paths that exist on disk, and the install tool the agent needs is registered.
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { afterEach, describe, expect, it } from 'vitest'
import { createDshEngineDefinition, createWebEngineDefinition } from '../src/engine-dsh.ts'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createAcrylEngineHost } from '../src/engine-host.ts'
import { createAcrylSessionBridge } from '../src/session-bridge.ts'

const temporaryHomes: string[] = []
const initialDshHome = process.env.DSH_HOME

afterEach(async () => {
  process.env.DSH_HOME = initialDshHome
  await Promise.all(temporaryHomes.splice(0).map(home => rm(home, { force: true, recursive: true })))
})

describe('extension context on the web engine', () => {
  it('mounts, routes the prompt to docs that exist, and registers the install tool', async () => {
    const home = await mkdtemp(join(tmpdir(), 'acryl-extension-context-'))
    temporaryHomes.push(home)
    process.env.DSH_HOME = home
    const installPackageUrl = new URL('../package.json', import.meta.url).href
    const host = await createAcrylEngineHost({
      engines: [createWebEngineDefinition(installPackageUrl)],
      initialEngine: 'dsh',
      prepare: hostCtx => {
        provideCmdline(hostCtx, { args: ['--no-open', '--port', '0'], exit: () => {} })
      },
    })
    try {
      const rows = [...host.ctx.loader.entries()]
      expect(rows.some(entry => entry.options.id === 'extension-context')).toBe(true)

      const context = host.ctx.get('extensionContext' as never) as { root: string } | undefined
      expect(context).toBeDefined()
      expect(existsSync(join(context!.root, 'docs', 'docs.json'))).toBe(true)

      const assembly = await host.ctx.get('systemPrompt')!.assemble()
      const router = assembly.sections.find(section => section.name === 'acryl:extension-router')
      expect(router).toBeDefined()
      const text = String((router as { text?: unknown }).text)
      expect(text).toContain(join(context!.root, 'docs', 'README.md'))
      expect(text).toContain('acryl_install_plugin')
      expect(existsSync(join(context!.root, 'docs', 'start-here', 'this-runtime.md'))).toBe(true)

      const toolNames = assembly.tools.map(tool => tool.name)
      expect(toolNames).toEqual(expect.arrayContaining(['acryl_install_plugin', 'acryl_list_plugins', 'acryl_remove_plugin', 'acryl_prepare_publish', 'acryl_verify_plugin']))
    } finally {
      await host.dispose()
    }
  }, 60_000)

  it('mounts on the CLI (tui) engine too', async () => {
    const home = await mkdtemp(join(tmpdir(), 'acryl-extension-context-tui-'))
    temporaryHomes.push(home)
    process.env.DSH_HOME = home
    const host = await createAcrylEngineHost({
      engines: [createDshEngineDefinition('acryl-ext-test')],
      initialEngine: 'dsh',
    })
    try {
      const rows = [...host.ctx.loader.entries()]
      expect(rows.some(entry => entry.options.id === 'extension-context')).toBe(true)
      const assembly = await host.ctx.get('systemPrompt')!.assemble()
      expect(assembly.sections.some(section => section.name === 'acryl:extension-router')).toBe(true)
      expect(assembly.tools.map(tool => tool.name)).toEqual(expect.arrayContaining(['acryl_install_plugin']))
    } finally {
      await host.dispose()
    }
  }, 60_000)
})

describe('/reload on the web engine', () => {
  it('is registered for a session and re-installs no local plugins when there are none', async () => {
    const home = await mkdtemp(join(tmpdir(), 'acryl-extension-reload-'))
    temporaryHomes.push(home)
    process.env.DSH_HOME = home
    const host = await createAcrylEngineHost({
      engines: [createWebEngineDefinition(new URL('../package.json', import.meta.url).href)],
      initialEngine: 'dsh',
      prepare: hostCtx => { provideCmdline(hostCtx, { args: ['--no-open', '--port', '0'], exit: () => {} }) },
    })
    const bridge = createAcrylSessionBridge(host.ctx, { profile: 'web', generationId: 'reload', attachment: 'owner', cwd: home })
    try {
      const sessionId = await bridge.open()
      const agent = (host.ctx as unknown as { agents: { get(id: unknown): unknown } }).agents.get(SessionId(sessionId))
      const commands = host.ctx.get('commands' as never) as {
        list(agent: unknown): Array<{ name: string }>
        execute(agent: unknown, line: string, attachments: unknown[], signal: AbortSignal): Promise<{ result: { kind: string; text?: string } } | undefined>
      }
      expect(commands.list(agent).map(command => command.name)).toContain('reload')
      const execution = await commands.execute(agent, '/reload', [], new AbortController().signal)
      expect(execution?.result).toMatchObject({ kind: 'success', text: 'No local extensions installed or found in .acryl-extensions/.' })
    } finally {
      await bridge.dispose()
      await host.dispose()
    }
  }, 60_000)

  it('reports the real surface and profile to the workspace-status tool', async () => {
    const home = await mkdtemp(join(tmpdir(), 'acryl-extension-surface-'))
    temporaryHomes.push(home)
    process.env.DSH_HOME = home
    const host = await createAcrylEngineHost({
      engines: [createWebEngineDefinition(new URL('../package.json', import.meta.url).href)],
      initialEngine: 'dsh',
      prepare: hostCtx => { provideCmdline(hostCtx, { args: ['--no-open', '--port', '0'], exit: () => {} }) },
    })
    try {
      expect(process.env.ACRYL_SURFACE).toBe('web')
      expect(process.env.ACRYL_PROFILE).toBe('web')
    } finally { await host.dispose() }
  }, 60_000)

  it('/reload lists a new folder from the session workspace, /reload new installs it, and the prompt then lists it', async () => {
    const home = await mkdtemp(join(tmpdir(), 'acryl-extension-discover-'))
    temporaryHomes.push(home)
    process.env.DSH_HOME = home
    const workspace = await mkdtemp(join(tmpdir(), 'acryl-extension-ws-'))
    temporaryHomes.push(workspace)
    const source = new URL('../../../plugins/acryl-extension-context/examples/packages/tool-basic/', import.meta.url).pathname
    const target = join(workspace, '.acryl-extensions', 'dropped-tool')
    mkdirSync(join(workspace, '.acryl-extensions'), { recursive: true })
    cpSync(source, target, { recursive: true })
    const host = await createAcrylEngineHost({
      engines: [createWebEngineDefinition(new URL('../package.json', import.meta.url).href)],
      initialEngine: 'dsh',
      prepare: hostCtx => { provideCmdline(hostCtx, { args: ['--no-open', '--port', '0'], exit: () => {} }) },
    })
    const bridge = createAcrylSessionBridge(host.ctx, { profile: 'web', generationId: 'discover', attachment: 'owner', cwd: workspace })
    try {
      const sessionId = await bridge.open()
      const agent = (host.ctx as unknown as { agents: { get(id: unknown): unknown } }).agents.get(SessionId(sessionId))
      const commands = host.ctx.get('commands' as never) as unknown as {
        execute(agent: unknown, line: string, attachments: unknown[], signal: AbortSignal): Promise<{ result: { kind: string; text?: string } } | undefined>
      }
      const before = await (host.ctx.get('systemPrompt' as never) as unknown as { assemble(): Promise<{ contexts: Array<{ name: string; text: string }> }> }).assemble()
      expect(before.contexts.find(c => c.name === 'acryl:installed-extensions')?.text ?? '').toBe('')
      // Plain /reload only LISTS a new folder (it would run with the user's permissions); nothing is installed.
      const listed = await commands.execute(agent, '/reload', [], new AbortController().signal)
      expect(listed?.result.text).toContain('NEW, not installed')
      const stillEmpty = await (host.ctx.get('systemPrompt' as never) as unknown as { assemble(): Promise<{ contexts: Array<{ name: string; text: string }> }> }).assemble()
      expect(stillEmpty.contexts.find(c => c.name === 'acryl:installed-extensions')?.text ?? '').toBe('')
      const execution = await commands.execute(agent, '/reload new', [], new AbortController().signal)
      expect(execution?.result.kind).toBe('success')
      expect(execution?.result.text).toContain('(new)')
      const after = await (host.ctx.get('systemPrompt' as never) as unknown as { assemble(): Promise<{ contexts: Array<{ name: string; text: string }> }> }).assemble()
      const listing = after.contexts.find(c => c.name === 'acryl:installed-extensions')?.text ?? ''
      expect(listing).toContain('acryl-example-tool')
      expect(listing).toContain('dropped-tool')
    } finally {
      await bridge.dispose()
      await host.dispose()
    }
  }, 120_000)
})
