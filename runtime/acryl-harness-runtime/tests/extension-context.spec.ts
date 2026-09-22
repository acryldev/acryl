/**
 * Real-engine proof for the Extension Context Pack (spec 037): the web engine
 * mounts the plugin, the assembled system prompt carries the docs router with
 * paths that exist on disk, and the install tool the agent needs is registered.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { afterEach, describe, expect, it } from 'vitest'
import { createDshEngineDefinition, createWebEngineDefinition } from '../src/engine-dsh.ts'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createAcrylEngineHost } from '../src/engine-host.ts'
// @ts-expect-error plain JS package
import { installLocalPlugin, listLocalPlugins } from '../../../plugins/acryl-extension-context/lib/install.js'
// @ts-expect-error plain JS package
import { stagedInfo } from '../../../plugins/acryl-extension-context/lib/reconcile.js'
// @ts-expect-error plain JS package
import { hashPackage } from '../../../plugins/acryl-extension-context/lib/stage.js'
import { createAcrylSessionBridge } from '../src/session-bridge.ts'

const temporaryHomes: string[] = []
const initialDshHome = process.env.DSH_HOME

afterEach(async () => {
  // Assigning undefined would store the string "undefined" and the next boot would create a ./undefined profile directory.
  if (initialDshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = initialDshHome
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
      // The UI library (spec 038-ui-component-library) is a Loader row on the web engine, so every client bundle can require('@acryl/ui').
      expect(rows.some(entry => entry.options.id === '@acryl/ui')).toBe(true)

      const context = host.ctx.get('extensionContext' as never) as { root: string } | undefined
      expect(context).toBeDefined()
      expect(existsSync(join(context!.root, 'docs', 'docs.json'))).toBe(true)

      const assembly = await host.ctx.get('systemPrompt')!.assemble()
      const router = assembly.sections.find(section => section.name === 'acryl:extension-router')
      expect(router).toBeDefined()
      const text = String((router as { text?: unknown }).text)
      expect(text).toContain(context!.root)   // one absolute pack root; the doc paths after it are relative
      expect(text).toContain('docs/README.md')
      expect(text).toContain('acryl_install_plugin')
      expect(existsSync(join(context!.root, 'docs', 'start-here', 'this-runtime.md'))).toBe(true)

      const toolNames = assembly.tools.map(tool => tool.name)
      expect(toolNames).toEqual(expect.arrayContaining(['acryl_install_plugin', 'acryl_list_plugins', 'acryl_remove_plugin', 'acryl_prepare_publish', 'acryl_verify_plugin', 'acryl_extension_lookup']))
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
      expect(execution?.result).toMatchObject({ kind: 'success', text: 'No local extensions installed or found in <workspace>/.acryl-extensions/ or the global extensions directory.' })
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
    const source = new URL('../../../plugins/acryl-extension-context/example-plugins/packages/tool-basic/', import.meta.url).pathname
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

  it('/reload discovers the GLOBAL scope, installs it on request, and skips an unchanged source (shadowing is covered by the pack unit test)', async () => {
    const home = await mkdtemp(join(tmpdir(), 'acryl-extension-global-'))
    temporaryHomes.push(home)
    process.env.DSH_HOME = home   // not named .dsh, so the global directory is <home>/extensions
    const workspace = await mkdtemp(join(tmpdir(), 'acryl-extension-global-ws-'))
    temporaryHomes.push(workspace)
    const source = new URL('../../../plugins/acryl-extension-context/example-plugins/packages/tool-basic/', import.meta.url).pathname
    cpSync(source, join(home, 'extensions', 'global-tool'), { recursive: true })
    const host = await createAcrylEngineHost({
      engines: [createWebEngineDefinition(new URL('../package.json', import.meta.url).href)],
      initialEngine: 'dsh',
      prepare: hostCtx => { provideCmdline(hostCtx, { args: ['--no-open', '--port', '0'], exit: () => {} }) },
    })
    const bridge = createAcrylSessionBridge(host.ctx, { profile: 'web', generationId: 'global', attachment: 'owner', cwd: workspace })
    try {
      const sessionId = await bridge.open()
      const agent = (host.ctx as unknown as { agents: { get(id: unknown): unknown } }).agents.get(SessionId(sessionId))
      const commands = host.ctx.get('commands' as never) as unknown as {
        execute(agent: unknown, line: string, attachments: unknown[], signal: AbortSignal): Promise<{ result: { kind: string; text?: string } } | undefined>
      }
      const run = async (line: string) => (await commands.execute(agent, line, [], new AbortController().signal))?.result.text ?? ''
      expect(await run('/reload')).toContain('[global]: NEW, not installed')
      expect(await run('/reload new')).toContain('acryl-example-tool [global]: installed (new)')
      // Nothing changed on disk: the second reload does not run the package manager or restart the plugin.
      const again = await run('/reload')
      expect(again).toContain('acryl-example-tool [global]: unchanged')
      expect(again).not.toContain('Reload the page')
      // A project folder is listed with its own scope tag.
      cpSync(source, join(workspace, '.acryl-extensions', 'project-tool'), { recursive: true })
      expect(await run('/reload')).toContain('[project]: NEW, not installed')
    } finally {
      await bridge.dispose()
      await host.dispose()
    }
  }, 180_000)

  it('the startup pass re-syncs a changed GLOBAL extension by itself, and /reload shows the permissions a NEW one requests', async () => {
    const home = await mkdtemp(join(tmpdir(), 'acryl-extension-startup-'))
    temporaryHomes.push(home)
    process.env.DSH_HOME = home   // not named .dsh, so the global directory is <home>/extensions
    const workspace = await mkdtemp(join(tmpdir(), 'acryl-extension-startup-ws-'))
    temporaryHomes.push(workspace)
    const source = new URL('../../../plugins/acryl-extension-context/example-plugins/packages/tool-basic/', import.meta.url).pathname
    const target = join(home, 'extensions', 'startup-tool')
    cpSync(source, target, { recursive: true })
    const manifestPath = join(target, 'package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    writeFileSync(manifestPath, JSON.stringify({ ...manifest, acryl: { apiVersion: 1, permissions: ['shell'] } }))
    const boot = () => createAcrylEngineHost({
      engines: [createWebEngineDefinition(new URL('../package.json', import.meta.url).href)],
      initialEngine: 'dsh',
      prepare: hostCtx => { provideCmdline(hostCtx, { args: ['--no-open', '--port', '0'], exit: () => {} }) },
    })
    // First run: the human installs it (permissions are shown first), then the app closes.
    let host = await boot()
    let bridge = createAcrylSessionBridge(host.ctx, { profile: 'web', generationId: 'startup-1', attachment: 'owner', cwd: workspace })
    let profileDir: string
    try {
      const sessionId = await bridge.open()
      const agent = (host.ctx as unknown as { agents: { get(id: unknown): unknown } }).agents.get(SessionId(sessionId))
      const commands = host.ctx.get('commands' as never) as unknown as {
        execute(agent: unknown, line: string, attachments: unknown[], signal: AbortSignal): Promise<{ result: { text?: string } } | undefined>
      }
      const listed = (await commands.execute(agent, '/reload', [], new AbortController().signal))?.result.text ?? ''
      expect(listed).toContain('requests: shell')
      expect((await commands.execute(agent, '/reload new', [], new AbortController().signal))?.result.text).toContain('installed (new)')
      profileDir = (host.ctx.get('desktopProfiles' as never) as { current: { dir: string } }).current.dir
    } finally { await bridge.dispose(); await host.dispose() }

    // The source changes while the app is closed (an edit, a sync). Booting again must apply it without any command.
    writeFileSync(join(target, 'index.js'), `${readFileSync(join(target, 'index.js'), 'utf8')}\n// changed while closed\n`)
    const inSync = () => {
      const [plugin] = listLocalPlugins(profileDir) as Array<{ installedDir: string; installedFrom: string }>
      return plugin !== undefined && stagedInfo(plugin.installedDir)?.version === hashPackage(plugin.installedFrom)
    }
    expect(inSync()).toBe(false)
    host = await boot()
    bridge = createAcrylSessionBridge(host.ctx, { profile: 'web', generationId: 'startup-2', attachment: 'owner', cwd: workspace })
    try {
      const deadline = Date.now() + 90_000
      while (!inSync() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 500))
      expect(inSync()).toBe(true)
    } finally { await bridge.dispose(); await host.dispose() }
  }, 240_000)

  it('/blend snapshot captures marketplace and local plugins into the workspace, and /blend verify checks it against its lock', async () => {
    const home = await mkdtemp(join(tmpdir(), 'acryl-extension-blend-'))
    temporaryHomes.push(home)
    process.env.DSH_HOME = home
    const workspace = await mkdtemp(join(tmpdir(), 'acryl-extension-blend-ws-'))
    temporaryHomes.push(workspace)
    const source = new URL('../../../plugins/acryl-extension-context/example-plugins/packages/tool-basic/', import.meta.url).pathname
    cpSync(source, join(workspace, '.acryl-extensions', 'blend-tool'), { recursive: true })
    const host = await createAcrylEngineHost({
      engines: [createWebEngineDefinition(new URL('../package.json', import.meta.url).href)],
      initialEngine: 'dsh',
      prepare: hostCtx => { provideCmdline(hostCtx, { args: ['--no-open', '--port', '0'], exit: () => {} }) },
    })
    const bridge = createAcrylSessionBridge(host.ctx, { profile: 'web', generationId: 'blend', attachment: 'owner', cwd: workspace })
    try {
      const sessionId = await bridge.open()
      const agent = (host.ctx as unknown as { agents: { get(id: unknown): unknown } }).agents.get(SessionId(sessionId))
      const commands = host.ctx.get('commands' as never) as unknown as {
        execute(agent: unknown, line: string, attachments: unknown[], signal: AbortSignal): Promise<{ result: { kind: string; text?: string } } | undefined>
      }
      const run = async (line: string) => (await commands.execute(agent, line, [], new AbortController().signal))?.result
      expect((await run('/reload new'))?.text).toContain('installed (new)')
      const snapshot = await run('/blend snapshot')
      expect(snapshot?.kind).toBe('success')
      expect(snapshot?.text).toContain('1 local extension(s) vendored')
      const out = join(workspace, '.acryl', 'blend')
      const lock = JSON.parse(readFileSync(join(out, 'blend.lock.json'), 'utf8'))
      expect(lock.formatVersion).toBe(2)
      expect(lock.modules).toEqual([expect.objectContaining({ name: 'acryl-example-tool', origin: 'local', source: 'extensions/acryl-example-tool' })])
      expect(existsSync(join(out, 'extensions', 'acryl-example-tool', 'index.js'))).toBe(true)
      expect(readFileSync(join(out, 'blend.yaml'), 'utf8')).toContain('name: acryl-example-tool')
      expect((await run('/blend verify'))?.text).toContain('ledger: 1 entries, chain intact')   // the capture itself is the first ledger entry
      // From now on this workspace tracks a Blend: a plugin installed later is one line of history.
      cpSync(source, join(workspace, '.acryl-extensions', 'second-tool'), { recursive: true })
      const secondManifest = JSON.parse(readFileSync(join(workspace, '.acryl-extensions', 'second-tool', 'package.json'), 'utf8'))
      writeFileSync(join(workspace, '.acryl-extensions', 'second-tool', 'package.json'), JSON.stringify({ ...secondManifest, name: 'acryl-second-tool' }))
      writeFileSync(join(workspace, '.acryl-extensions', 'second-tool', 'cordis.patch.yml'), '- insert:\n    - id: second-tool\n      name: acryl-second-tool\n')
      writeFileSync(join(workspace, '.acryl-extensions', 'second-tool', 'index.js'), "export const name = 'acryl-second-tool'\nexport function apply() {}\n")   // registers nothing, so it cannot clash with the first tool
      const reloadNew = (await run('/reload new'))?.text
      expect(reloadNew, String(reloadNew)).toContain('installed (new)')
      const ledger = (await run('/blend ledger'))?.text ?? ''
      expect(ledger).toContain('human captured'); expect(ledger).toContain('human installed acryl-second-tool@0.1.0')
      const ledgerFile = join(out, 'ledger.jsonl')
      expect(readFileSync(ledgerFile, 'utf8').trim().split('\n')).toHaveLength(2)   // captured, then the install
      // editing history is detected
      const lines = readFileSync(ledgerFile, 'utf8').trim().split('\n')
      writeFileSync(ledgerFile, `${[lines[0].replace('captured', 'applied'), lines[1]].join('\n')}\n`)
      expect((await run('/blend verify'))?.text).toContain('line 2 does not follow line 1')
      writeFileSync(ledgerFile, `${lines.join('\n')}\n`)
      writeFileSync(join(out, 'extensions', 'acryl-example-tool', 'index.js'), '// tampered\n')
      const broken = await run('/blend verify')
      expect(broken?.kind).toBe('error')
      expect(broken?.text).toContain('differs from the locked digest')
      expect((await run('/blend nonsense'))?.kind).toBe('error')
    } finally {
      await bridge.dispose()
      await host.dispose()
    }
  }, 180_000)

  it('a Blend captured on one app is re-created on a fresh app with /blend apply (round trip)', async () => {
    const boot = () => createAcrylEngineHost({
      engines: [createWebEngineDefinition(new URL('../package.json', import.meta.url).href)],
      initialEngine: 'dsh',
      prepare: hostCtx => { provideCmdline(hostCtx, { args: ['--no-open', '--port', '0'], exit: () => {} }) },
    })
    const runner = async (host: Awaited<ReturnType<typeof boot>>, generationId: string, cwd: string) => {
      const bridge = createAcrylSessionBridge(host.ctx, { profile: 'web', generationId, attachment: 'owner', cwd })
      const sessionId = await bridge.open()
      const agent = (host.ctx as unknown as { agents: { get(id: unknown): unknown } }).agents.get(SessionId(sessionId))
      const commands = host.ctx.get('commands' as never) as unknown as {
        execute(agent: unknown, line: string, attachments: unknown[], signal: AbortSignal): Promise<{ result: { kind: string; text?: string } } | undefined>
      }
      return { bridge, run: async (line: string) => (await commands.execute(agent, line, [], new AbortController().signal))?.result }
    }
    const source = new URL('../../../plugins/acryl-extension-context/example-plugins/packages/tool-basic/', import.meta.url).pathname

    // App A: build a local extension, install it, capture the Blend.
    const homeA = await mkdtemp(join(tmpdir(), 'acryl-blend-a-')); temporaryHomes.push(homeA)
    const wsA = await mkdtemp(join(tmpdir(), 'acryl-blend-a-ws-')); temporaryHomes.push(wsA)
    process.env.DSH_HOME = homeA
    cpSync(source, join(wsA, '.acryl-extensions', 'round-trip'), { recursive: true })
    let host = await boot()
    let session = await runner(host, 'blend-a', wsA)
    try {
      expect((await session.run('/reload new'))?.text).toContain('installed (new)')
      expect((await session.run('/blend snapshot'))?.kind).toBe('success')
    } finally { await session.bridge.dispose(); await host.dispose() }

    // App B: a different home and a different workspace that only has the captured .acryl/blend directory.
    const homeB = await mkdtemp(join(tmpdir(), 'acryl-blend-b-')); temporaryHomes.push(homeB)
    const wsB = await mkdtemp(join(tmpdir(), 'acryl-blend-b-ws-')); temporaryHomes.push(wsB)
    process.env.DSH_HOME = homeB
    cpSync(join(wsA, '.acryl', 'blend'), join(wsB, '.acryl', 'blend'), { recursive: true })
    host = await boot()
    session = await runner(host, 'blend-b', wsB)
    try {
      expect((await session.run('/reload'))?.text).not.toContain('acryl-example-tool')   // nothing installed yet
      const applied = await session.run('/blend apply')
      expect(applied?.kind).toBe('success')
      expect(applied?.text).toContain('acryl-example-tool [local]: installed')
      expect(existsSync(join(wsB, '.acryl-extensions', 'acryl-example-tool', 'index.js'))).toBe(true)
      const again = await session.run('/blend apply')
      expect(again?.text).toContain('acryl-example-tool [local]: unchanged')   // idempotent
      expect((await session.run('/reload'))?.text).toContain('acryl-example-tool [project]: unchanged')
    } finally { await session.bridge.dispose(); await host.dispose() }
  }, 300_000)

  it('host code updates take effect in the running process without a hot shim (automatic reload)', async () => {
    const home = await mkdtemp(join(tmpdir(), 'acryl-extension-hot-'))
    temporaryHomes.push(home)
    process.env.DSH_HOME = home
    const workspace = await mkdtemp(join(tmpdir(), 'acryl-extension-hot-ws-'))
    temporaryHomes.push(workspace)
    const dir = join(workspace, '.acryl-extensions', 'probe')
    mkdirSync(dir, { recursive: true })
    const write = (entryText: string, helperText: string, extra = '') => {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({
        name: 'acryl-probe-hot', version: '0.1.0', type: 'module', main: './index.js',
        exports: { '.': './index.js', './package.json': './package.json' },
        files: ['index.js', 'helper.js', 'cordis.patch.yml'],
        dsh: { bundle: { patch: './cordis.patch.yml' } },
      }))
      writeFileSync(join(dir, 'cordis.patch.yml'), '- insert:\n    - id: probe-hot\n      name: acryl-probe-hot\n')
      writeFileSync(join(dir, 'helper.js'), `export const text = ${JSON.stringify(helperText)}\n`)
      writeFileSync(join(dir, 'index.js'), [
        "import { text } from './helper.js'",
        "export const name = 'acryl-probe-hot'",
        "export const inject = ['commands']",
        'export function apply(ctx) {',
        "  ctx.effect(() => ctx.commands.register({ name: 'probe-hot', description: 'probe', async handler() { return { kind: 'success', text: " + JSON.stringify(entryText) + " + text } } }), 'probe')",
        '}',
        extra,
      ].join('\n'))
    }
    write('entry-1:', 'helper-1')
    const host = await createAcrylEngineHost({
      engines: [createWebEngineDefinition(new URL('../package.json', import.meta.url).href)],
      initialEngine: 'dsh',
      prepare: hostCtx => { provideCmdline(hostCtx, { args: ['--no-open', '--port', '0'], exit: () => {} }) },
    })
    const bridge = createAcrylSessionBridge(host.ctx, { profile: 'web', generationId: 'hot', attachment: 'owner', cwd: workspace })
    try {
      const sessionId = await bridge.open()
      const agent = (host.ctx as unknown as { agents: { get(id: unknown): unknown } }).agents.get(SessionId(sessionId))
      const commands = host.ctx.get('commands' as never) as unknown as {
        execute(agent: unknown, line: string, attachments: unknown[], signal: AbortSignal): Promise<{ result: { kind: string; text?: string } } | undefined>
      }
      const services = {
        pnpm: host.ctx.get('desktopPnpm' as never),
        live: host.ctx.get('livePluginActivation' as never),
        profileDir: (host.ctx.get('desktopProfiles' as never) as { current: { dir: string } }).current.dir,
      }
      const first = await installLocalPlugin({ path: dir }, services)
      expect(first).toMatchObject({ ok: true, status: 'active', action: 'installed', hostReload: 'automatic' })
      expect((await commands.execute(agent, '/probe-hot', [], new AbortController().signal))?.result.text).toBe('entry-1:helper-1')

      // Change BOTH the entry and the file it imports: the running process must pick up both.
      write('entry-2:', 'helper-2')
      const second = await installLocalPlugin({ path: dir }, services)
      expect(second).toMatchObject({ ok: true, status: 'active', action: 'updated', hostReload: 'automatic' })
      expect(second.warning).toBeUndefined()
      expect((await commands.execute(agent, '/probe-hot', [], new AbortController().signal))?.result.text).toBe('entry-2:helper-2')

      // /reload re-installs from the SOURCE folder (not the staging copy).
      write('entry-3:', 'helper-3')
      const reloaded = await commands.execute(agent, '/reload', [], new AbortController().signal)
      expect(reloaded?.result.text).toContain('acryl-probe-hot [project]: updated')
      expect((await commands.execute(agent, '/probe-hot', [], new AbortController().signal))?.result.text).toBe('entry-3:helper-3')
    } finally {
      await bridge.dispose()
      await host.dispose()
    }
  }, 180_000)

  it('a staged plugin whose apply throws surfaces its own error and is rolled back', async () => {
    const home = await mkdtemp(join(tmpdir(), 'acryl-extension-throw-'))
    temporaryHomes.push(home)
    process.env.DSH_HOME = home
    const workspace = await mkdtemp(join(tmpdir(), 'acryl-extension-throw-ws-'))
    temporaryHomes.push(workspace)
    const dir = join(workspace, '.acryl-extensions', 'thrower')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'acryl-thrower', version: '0.1.0', type: 'module', main: './index.js', exports: { '.': './index.js', './package.json': './package.json' }, dsh: { bundle: { patch: './cordis.patch.yml' } } }))
    writeFileSync(join(dir, 'cordis.patch.yml'), '- insert:\n    - id: thrower\n      name: acryl-thrower\n')
    writeFileSync(join(dir, 'index.js'), "export const name = 'acryl-thrower'\nexport function apply() { throw new Error('boom-42 from the plugin') }\n")
    const host = await createAcrylEngineHost({
      engines: [createWebEngineDefinition(new URL('../package.json', import.meta.url).href)],
      initialEngine: 'dsh',
      prepare: hostCtx => { provideCmdline(hostCtx, { args: ['--no-open', '--port', '0'], exit: () => {} }) },
    })
    try {
      const services = {
        pnpm: host.ctx.get('desktopPnpm' as never),
        live: host.ctx.get('livePluginActivation' as never),
        profileDir: (host.ctx.get('desktopProfiles' as never) as { current: { dir: string } }).current.dir,
      }
      const result = await installLocalPlugin({ path: dir }, services)
      expect(result.ok).toBe(false)
      expect(result.stage).toBe('activate')
      expect(JSON.stringify(result.errors)).toContain('boom-42 from the plugin')
      expect(result.rolledBack).toBe(true)
    } finally { await host.dispose() }
  }, 120_000)
})
