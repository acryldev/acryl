/**
 * Spec 001 T089: one store for enabling and disabling a plugin. A plugin is switched from DSH's own Plugins page (`pluginManager`, ACRYL's
 * subclass in its row) and from ACRYL's Lifecycle tab (`acrPluginLifecycle`), with an app restart between every step, on a real Web engine in a
 * throwaway home. Before T089 the two wrote two files, and a disable written by either kept the plugin off whatever the other said.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isSeq, parseDocument } from 'yaml'
import { createWebEngineDefinition } from '../src/engine-dsh.ts'
import { createAcrylEngineHost } from '../src/engine-host.ts'
import { resolvePluginLifecycleStatePath } from '../src/plugin-lifecycle-state.ts'

const ENTRY = 'include:t089-probe'

interface ManagerRow { entryId: string; enabled: boolean; patchId?: string; readOnlyReason?: string }
interface Manager {
  installBundle(spec: string): Promise<{ application: string; error?: unknown }>
  listPlugins(): Promise<ManagerRow[]>
  setPluginEnabled(id: string, enabled: boolean): Promise<{ application: string; changed: boolean; error?: unknown }>
}
interface Lifecycle { setEnabled(entryId: string, enabled: boolean): Promise<unknown>; snapshot(): { entries: { entryId: string; enabled: boolean; mutable: boolean }[] } }

let home: string
const initialDshHome = process.env['DSH_HOME']

beforeAll(async () => {
  home = await mkdtemp(join(tmpdir(), 'acryl-t089-'))
  process.env['DSH_HOME'] = join(home, 'dsh')
})
afterAll(async () => {
  if (initialDshHome === undefined) delete process.env['DSH_HOME']
  else process.env['DSH_HOME'] = initialDshHome
  await rm(home, { recursive: true, force: true })
})

/** One app start: boot, run `body` against both pages' services, shut down. */
async function start<T>(body: (pages: { manager: Manager; lifecycle: Lifecycle; profileDir: string }) => Promise<T>): Promise<T> {
  const host = await createAcrylEngineHost({
    engines: [createWebEngineDefinition(new URL('../package.json', import.meta.url).href)],
    initialEngine: 'dsh',
    prepare: ctx => { provideCmdline(ctx, { args: ['--no-open', '--port', '0'], exit: () => {} }) },
  })
  try {
    return await body({
      manager: host.ctx.get('pluginManager' as never) as unknown as Manager,
      lifecycle: host.ctx.get('acrPluginLifecycle' as never) as unknown as Lifecycle,
      profileDir: join(process.env['DSH_HOME'] ?? '', 'profiles', 'web'),
    })
  } finally {
    await host.dispose()
  }
}

async function row(manager: Manager): Promise<ManagerRow | undefined> {
  return (await manager.listPlugins()).find(candidate => candidate.entryId === ENTRY)
}

function profilePatch(profileDir: string): string {
  const path = join(profileDir, 'cordis.patch.yml')
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

function stored(): string[] {
  const path = resolvePluginLifecycleStatePath(process.env['DSH_HOME'])
  if (!existsSync(path)) return []
  return (JSON.parse(readFileSync(path, 'utf8')) as { profiles: { disabledEntries: string[] }[] }).profiles.flatMap(profile => profile.disabledEntries)
}

describe('T089: one enable/disable store for both plugin pages', () => {
  it('a plugin switched from either page, across restarts, is in the state the last switch left it', async () => {
    const bundle = join(home, 't089-probe')
    mkdirSync(bundle)
    writeFileSync(join(bundle, 'package.json'), `${JSON.stringify({ name: 't089-probe', version: '1.0.0', type: 'module', main: './index.js', dsh: { bundle: { patch: './cordis.patch.yml' } } }, null, 2)}\n`)
    writeFileSync(join(bundle, 'index.js'), "export const name = 't089-probe'\nexport function apply() {}\n")
    writeFileSync(join(bundle, 'cordis.patch.yml'), '- insert:\n    - id: t089-probe\n      name: t089-probe\n')

    const installed = await start(({ manager }) => manager.installBundle(bundle))
    expect(installed.error).toBeUndefined()

    // DSH's page lists ACRYL's row as one it can switch, and its switch is kept in ACRYL's store, not in the profile patch.
    await start(async ({ manager, lifecycle, profileDir }) => {
      const before = await row(manager)
      expect(before).toMatchObject({ enabled: true, patchId: 't089-probe' })
      expect(before?.readOnlyReason).toBeUndefined()
      expect(await manager.setPluginEnabled(ENTRY, false)).toMatchObject({ application: 'applied', changed: true })
      expect(lifecycle.snapshot().entries.find(entry => entry.entryId === ENTRY)?.enabled).toBe(false)
      expect(stored()).toEqual([ENTRY])
      expect(profilePatch(profileDir)).not.toMatch(/disabled/u)
    })

    // Restart: still off; ACRYL's tab switches it on.
    await start(async ({ manager, lifecycle }) => {
      expect((await row(manager))?.enabled).toBe(false)
      await lifecycle.setEnabled(ENTRY, true)
      expect(stored()).toEqual([])
    })

    // Restart: on. A disable the old DSH page wrote into the profile patch, as installed apps have them.
    const profileDir = await start(async ({ manager, profileDir }) => {
      expect((await row(manager))?.enabled).toBe(true)
      return profileDir
    })
    // Written as DSH's own writer does (`plugin-manager/src/patch.ts`: the YAML document's `add`), with a comment a person left above it.
    const legacy = parseDocument(profilePatch(profileDir) || '[]\n')
    const disable = legacy.createNode({ id: 't089-probe', disabled: true })
    disable.commentBefore = ' switched off on the old Plugins page'
    legacy.add(disable)
    if (isSeq(legacy.contents)) legacy.contents.flow = false
    writeFileSync(join(profileDir, 'cordis.patch.yml'), String(legacy))

    // Restart: off, from that old disable; DSH's page switches it on, which clears it, comments kept.
    await start(async ({ manager }) => {
      expect((await row(manager))?.enabled).toBe(false)
      expect(await manager.setPluginEnabled(ENTRY, true)).toMatchObject({ application: 'applied', changed: true })
      expect(profilePatch(profileDir)).not.toMatch(/disabled: true/u)
      expect(profilePatch(profileDir)).toMatch(/# switched off on the old Plugins page/u)
    })

    // Restart: on, and both pages agree.
    await start(async ({ manager, lifecycle }) => {
      expect((await row(manager))?.enabled).toBe(true)
      expect(lifecycle.snapshot().entries.find(entry => entry.entryId === ENTRY)).toMatchObject({ enabled: true, mutable: true })
    })
  }, 300_000)
})
