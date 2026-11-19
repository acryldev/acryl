/**
 * Spec 044 S12, opt-in and live (network, third-party code): ACRYL runs released community DSH plugins. Each plugin is pulled from its GitHub
 * release through the plugin hub (sha512 checked), installed with DSH's own installer into a throwaway Web profile (install scripts stay
 * blocked), and the engine is booted again, as an app restart does; then each plugin's Loader rows are read. The result is written to
 * ACRYL_LIVE_COMMUNITY_REPORT (JSON) for the spec's record. Run:
 *
 *   ACRYL_LIVE_COMMUNITY=1 ACRYL_LIVE_COMMUNITY_REPORT=/tmp/s12.json corepack pnpm --filter acryl-harness-runtime exec vitest run tests/live/community-plugins.spec.ts
 */
import { writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { createPluginHub, githubReleasesOverHttps, PluginStore, type InstallerPort } from '@webboxes/plugin-hub'
import { afterEach, describe, expect, it } from 'vitest'
import { createWebEngineDefinition } from '../../src/engine-dsh.ts'
import { createAcrylEngineHost } from '../../src/engine-host.ts'

const PLUGINS = [
  'SpookySandwich/dsh-plugin-message-edit',
  'SpookySandwich/dsh-plugin-smooth-stream',
  'yusufameri/dsh-t3-model-picker',
  'Charaaah/dsh-web-api-balance',
  'MoYu-CN/dsh-knowledge',
  'MoYu-CN/dsh-agent-profiles',
  'lgquan/dsh-workspace-memory',
  'wobenshiwomu/dsh-bite',
]

const live = process.env['ACRYL_LIVE_COMMUNITY'] === '1'
const homes: string[] = []
const initialDshHome = process.env['DSH_HOME']
afterEach(async () => {
  if (initialDshHome === undefined) delete process.env['DSH_HOME']
  else process.env['DSH_HOME'] = initialDshHome
  await Promise.all(homes.splice(0).map(home => rm(home, { recursive: true, force: true })))
})

const boot = () => createAcrylEngineHost({
  engines: [createWebEngineDefinition(new URL('../../package.json', import.meta.url).href)],
  initialEngine: 'dsh',
  prepare: hostCtx => { provideCmdline(hostCtx, { args: ['--no-open', '--port', '0'], exit: () => {} }) },
})

interface ManagerRows { listPlugins(): Promise<{ entryId: string; moduleName: string; enabled: boolean; fiberPhase?: string }[]> }

describe.skipIf(!live)('S12: ACRYL runs released community DSH plugins', () => {
  it('pulls, installs and restarts with each plugin, and records what each one does', async () => {
    const home = await mkdtemp(join(tmpdir(), 'acryl-s12-'))
    homes.push(home)
    process.env['DSH_HOME'] = home
    const report: Record<string, unknown>[] = []
    const first = await boot()
    try {
      const installer = first.ctx.get('pluginManager' as never) as unknown as InstallerPort
      const hub = createPluginHub({ store: new PluginStore(join(home, 'plugin-store')), releases: githubReleasesOverHttps(), has: name => first.ctx.get(name as never) !== undefined, installer: () => installer })
      for (const repo of PLUGINS) {
        try {
          const pulled = await hub.pull(`github:${repo}`)
          report.push({ repo, name: pulled.name, version: pulled.version, pull: pulled.status, contractChecked: pulled.contractChecked, ...(pulled.outcome?.error === undefined ? {} : { installError: pulled.outcome.error, output: pulled.outcome.packageResult?.output.split('\n').slice(-6).join('\n') }) })
        } catch (cause) {
          report.push({ repo, pull: 'error', error: cause instanceof Error ? cause.message : String(cause) })
        }
      }
    } finally {
      await first.dispose()
    }
    const again = await boot()
    try {
      const rows = await (again.ctx.get('pluginManager' as never) as unknown as ManagerRows).listPlugins()
      for (const entry of report) {
        const name = entry['name']
        if (typeof name !== 'string') continue
        entry['rows'] = rows.filter(row => row.moduleName === name || row.moduleName.startsWith(`${name}/`)).map(row => ({ entryId: row.entryId, enabled: row.enabled, phase: row.fiberPhase ?? 'unknown' }))
      }
    } finally {
      await again.dispose()
    }
    const out = process.env['ACRYL_LIVE_COMMUNITY_REPORT']
    if (out !== undefined) writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`)
    expect(report).toHaveLength(PLUGINS.length)
  }, 900_000)
})
