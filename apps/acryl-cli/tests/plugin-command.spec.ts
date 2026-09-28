import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { PluginLifecycleEntryView, PluginLifecycleSnapshot } from 'acryl-harness-runtime'
import { resolvePluginEntryId, runPluginCommand } from '../src/host/plugin-command.ts'
import { renderPluginCommand } from '../src/cli/plugin-render.ts'
import type { PluginCommandResult } from '../src/host/plugin-command.ts'

function entry(
  entryId: string,
  overrides: Partial<PluginLifecycleEntryView> = {},
): PluginLifecycleEntryView {
  return {
    entryId,
    moduleName: 'acryl-plugin',
    enabled: true,
    hostPhase: 'active',
    mutable: true,
    protectedReason: null,
    dependents: [],
    ...overrides,
  }
}

const SNAPSHOT: PluginLifecycleSnapshot = {
  entries: [
    entry('include:ui-acryl', { moduleName: '@acryl/dsh-client-ui-brand-acryl' }),
    entry('include:ui-brand-official', { moduleName: '@deepseek-ai/dsh-client-ui-brand-official' }),
    entry('include:market-plugin', { moduleName: 'cordis-plugin-market', enabled: false, hostPhase: null }),
  ],
}

describe('resolvePluginEntryId', () => {
  it('accepts the entry id a row shows', () => {
    expect(resolvePluginEntryId('acryl', SNAPSHOT, 'include:ui-acryl')).toBe('include:ui-acryl')
  })

  it('accepts the patch id the override file stores', () => {
    expect(resolvePluginEntryId('acryl', SNAPSHOT, 'ui-acryl')).toBe('include:ui-acryl')
  })

  it('accepts the package name the market shows', () => {
    expect(resolvePluginEntryId('acryl', SNAPSHOT, 'cordis-plugin-market')).toBe('include:market-plugin')
  })

  it('prefers an exact entry match over a package-name match', () => {
    const ambiguous: PluginLifecycleSnapshot = {
      entries: [entry('cordis-plugin-market', { moduleName: 'x' }), entry('include:market-plugin', { moduleName: 'cordis-plugin-market' })],
    }
    expect(resolvePluginEntryId('acryl', ambiguous, 'cordis-plugin-market')).toBe('cordis-plugin-market')
  })

  it('names the profile and the list command when nothing matches', () => {
    expect(() => resolvePluginEntryId('work', SNAPSHOT, 'nope')).toThrow(
      'profile "work" has no plugin "nope"; run `acryl plugin list --profile work`',
    )
  })

  it('refuses an ambiguous package name instead of picking one', () => {
    const ambiguous: PluginLifecycleSnapshot = {
      entries: [entry('include:a', { moduleName: 'shared-plugin' }), entry('include:b', { moduleName: 'shared-plugin' })],
    }
    expect(() => resolvePluginEntryId('acryl', ambiguous, 'shared-plugin')).toThrow(
      '"shared-plugin" is ambiguous in profile "acryl": include:a, include:b',
    )
  })
})

describe('runPluginCommand', () => {
  const savedHome = process.env.ACRYL_HOME
  const homes: string[] = []
  afterEach(() => {
    if (savedHome === undefined) delete process.env.ACRYL_HOME
    else process.env.ACRYL_HOME = savedHome
    for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
  })

  it('refuses enable/disable while the app owning this profile is live (TB20), without booting a second host', async () => {
    const home = mkdtempSync(join(tmpdir(), 'acryl-cli-plugin-cmd-'))
    homes.push(home)
    mkdirSync(home, { recursive: true })
    writeFileSync(join(home, 'instance.json'), JSON.stringify({ pid: process.pid, since: new Date().toISOString() }))
    process.env.ACRYL_HOME = home

    await expect(runPluginCommand({ profile: 'acryl', action: 'disable', entryId: 'x' }))
      .rejects.toThrow(/is live/)
    await expect(runPluginCommand({ profile: 'acryl', action: 'enable', entryId: 'x' }))
      .rejects.toThrow(/is live/)
  })
})

describe('renderPluginCommand', () => {
  const base = {
    profile: 'acryl',
    engine: 'dsh',
    statePath: '/home/.acryl/plugin-lifecycle/state.json',
  }

  it('reports a clean profile as an exit-0 doctor run', () => {
    const result: PluginCommandResult = {
      ...base,
      kind: 'health',
      report: {
        profileName: 'acryl',
        profileDir: '/home/.acryl/.dsh/profiles/acryl',
        statePath: base.statePath,
        pluginCount: 3,
        findings: [],
      },
    }

    expect(renderPluginCommand(result, false)).toEqual({
      lines: [
        'profile acryl (dsh) - 3 plugins',
        'no problems found',
        'override file: /home/.acryl/plugin-lifecycle/state.json',
      ],
      exitCode: 0,
    })
  })

  it('warns without failing the command', () => {
    const result: PluginCommandResult = {
      ...base,
      kind: 'health',
      report: {
        profileName: 'acryl',
        profileDir: '/home/.acryl/.dsh/profiles/acryl',
        statePath: base.statePath,
        pluginCount: 3,
        findings: [
          { severity: 'warning', code: 'stale-override', message: 'override for `gone` matches no composed entry' },
        ],
      },
    }

    expect(renderPluginCommand(result, false).exitCode).toBe(0)
  })

  it('marks core and failed entries, and says when there is nothing to change', () => {
    const result: PluginCommandResult = {
      ...base,
      kind: 'receipt',
      receipt: {
        accepted: true,
        action: 'disable',
        entryIds: [],
        snapshot: { entries: [entry('include:ui-acryl', { mutable: false, protectedReason: 'core' })] },
      },
    }

    expect(renderPluginCommand(result, false).lines[0]).toBe('nothing to disable in profile acryl')
    expect(renderPluginCommand({ ...result, kind: 'snapshot', snapshot: result.receipt.snapshot }, false).lines)
      .toContain('on  include:ui-acryl  acryl-plugin  (core)')
  })
})
