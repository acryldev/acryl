/**
 * The parity gate for Web and Desktop (spec 040 "Surface sharing", spec 034 FR-008).
 *
 * Both surfaces boot the same ACRYL runtime. A user-facing feature is a Cordis plugin composed for both from one
 * declaration (`coding-capabilities.ts`), so the two Loader trees may differ only by rows that are native to a
 * surface, each named below with its reason. A row that appears on one surface and not the other, and is not in
 * one of the lists, fails this test: either compose it for both, or add it here with the reason it cannot be shared.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { composeEntries } from '@deepseek-ai/dsh-app-boot'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { ACRYL_CODING_CAPABILITIES, createAcrylEngineHost, createWebEngineDefinition } from 'acryl-harness-runtime'
import { describe, expect, it } from 'vitest'
import { prepareDesktopProfile } from '../src/profile.ts'

/** Rows only the Electron app has: the native shell around the same runtime. */
const DESKTOP_NATIVE_ROWS: Readonly<Record<string, string>> = {
  'desktop-shell': 'the Electron window, tray and menu, Desktop settings, native folder drop and directory-picker bridge',
  'desktop-webserver': 'Desktop owns the loopback web server the renderer loads from (Web uses the stock one)',
  'desktop-profiles': 'desktop profile selection and creation (Web serves one profile)',
  'desktop-pnpm': 'the package manager Desktop installs plugins with (Web has its own install service)',
  'desktop-terminal': 'the native tray terminal (Web has workspace terminals in the page)',
  'desktop-notifications': 'native OS attention for finished turns (a Web equivalent is not built yet)',
  'desktop-diagnostics': 'native diagnostic export (Web has no log files to export yet)',
  'desktop-updates': 'application updates (Web is updated with its npm package)',
  'desktop-hello-world': 'research proof that ACRYL capabilities load as ordinary Cordis plugins',
}

/** Rows only Web has, or that Desktop replaces with its own. */
const WEB_ONLY_ROWS: Readonly<Record<string, string>> = {
  'acryl-engine': 'the engine host row the Web surface mounts the runtime under',
  include: 'the root include row of the engine host',
  'community-market': 'Web always composes the community market; Desktop makes the provider a user choice',
}

/** Rows whose package differs per surface by design. */
const PER_SURFACE_ANONYMOUS_PACKAGES = new Set([
  '@deepseek-ai/dsh-host-directory-picker-native',
  '@deepseek-ai/dsh-client-ui-directory-picker-native',
])

function summarize(rows: readonly { id?: unknown; name?: unknown; disabled?: unknown }[]): Map<string, { name: string; disabled: boolean }> {
  const map = new Map<string, { name: string; disabled: boolean }>()
  for (const row of rows) {
    if (typeof row.id === 'string') map.set(row.id, { name: String(row.name), disabled: row.disabled === true })
  }
  return map
}

async function composeBoth(): Promise<{ desktop: Map<string, { name: string; disabled: boolean }>; web: Map<string, { name: string; disabled: boolean }> }> {
  const desktopHome = mkdtempSync(join(tmpdir(), 'acryl-parity-d-'))
  const desktop = summarize(composeEntries([prepareDesktopProfile(undefined, desktopHome, 'darwin').patches]))
  process.env.ACRYL_HOME = mkdtempSync(join(tmpdir(), 'acryl-parity-w-'))
  const host = await createAcrylEngineHost({
    engines: [createWebEngineDefinition(new URL('../../acryl-web/package.json', import.meta.url).href)],
    initialEngine: 'dsh',
    prepare: (ctx) => { provideCmdline(ctx, { args: ['--no-open', '--port', '0'], exit: () => {} }) },
  })
  try {
    const web = summarize([...host.ctx.loader.entries()].map(entry => entry.options))
    return { desktop, web }
  } finally {
    await host.dispose()
  }
}

describe('Web and Desktop compose the same ACRYL features', () => {
  it('composes every capability declared for both surfaces, identically, on both', async () => {
    const { desktop, web } = await composeBoth()
    const sharedRowIds = ACRYL_CODING_CAPABILITIES
      .filter(capability => capability.surfaces.includes('web') && capability.surfaces.includes('desktop') && capability.shellMode === undefined)
      .flatMap(capability => capability.loaderPatches.flatMap(patch => 'insert' in patch ? (patch.insert ?? []).map(row => row.id) : []))
      .filter((id): id is string => typeof id === 'string')
    expect(sharedRowIds).toEqual(expect.arrayContaining(['authorization', 'acryl-workspace', 'acryl-plugin-admin']))
    for (const id of sharedRowIds) {
      expect(desktop.get(id), `Desktop row ${id}`).toBeDefined()
      expect(web.get(id), `Web row ${id}`).toBeDefined()
      expect(web.get(id), id).toEqual(desktop.get(id))
    }
    // The shell toggles are the same on both (Desktop's user-chosen mode defaults to advanced).
    for (const id of ['ui-layout', 'ui-sidebar', 'ui-conversation']) {
      expect(web.get(id), id).toEqual(desktop.get(id))
    }
  }, 120_000)

  it('differs only by rows that are native to one surface, each with a stated reason', async () => {
    const { desktop, web } = await composeBoth()
    const desktopOnly = [...desktop.keys()].filter(id => !web.has(id))
    const webOnly = [...web.keys()].filter(id => !desktop.has(id))
    const unexplainedDesktop = desktopOnly.filter(id => !(id in DESKTOP_NATIVE_ROWS))
    const unexplainedWeb = webOnly.filter(id => !(id in WEB_ONLY_ROWS) && !PER_SURFACE_ANONYMOUS_PACKAGES.has(web.get(id)?.name ?? ''))
    expect(unexplainedDesktop, 'rows only Desktop composes: compose them for both surfaces or list them with a reason').toEqual([])
    expect(unexplainedWeb, 'rows only Web composes: compose them for both surfaces or list them with a reason').toEqual([])
    // A listed native row that no longer exists is a stale allowlist entry.
    for (const id of Object.keys(DESKTOP_NATIVE_ROWS)) expect(desktop.has(id), `stale allowlist entry ${id}`).toBe(true)
    for (const id of Object.keys(WEB_ONLY_ROWS)) expect(web.has(id), `stale allowlist entry ${id}`).toBe(true)
    // Rows both have must agree on the package and on whether they are enabled, apart from the two the surface owns.
    const disagreements = [...desktop.keys()]
      .filter(id => web.has(id) && id !== 'webserver')
      .filter(id => JSON.stringify(desktop.get(id)) !== JSON.stringify(web.get(id)))
    expect(disagreements).toEqual([])
  }, 120_000)
})
