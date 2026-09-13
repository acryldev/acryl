import { describe, expect, it } from 'vitest'
import type { PluginLifecycleEntryView, PluginLifecycleSnapshot } from 'acryl-harness-runtime'
import { resolvePluginEntryId } from '../src/host/plugin-command.ts'
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
    entry('include:market-plugin', { moduleName: 'dsh-community-market', enabled: false, hostPhase: null }),
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
    expect(resolvePluginEntryId('acryl', SNAPSHOT, 'dsh-community-market')).toBe('include:market-plugin')
  })

  it('prefers an exact entry match over a package-name match', () => {
    const ambiguous: PluginLifecycleSnapshot = {
      entries: [entry('dsh-community-market', { moduleName: 'x' }), entry('include:market-plugin', { moduleName: 'dsh-community-market' })],
    }
    expect(resolvePluginEntryId('acryl', ambiguous, 'dsh-community-market')).toBe('dsh-community-market')
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
