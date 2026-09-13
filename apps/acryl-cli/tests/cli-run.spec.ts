import { afterEach, describe, expect, it } from 'vitest'
import type { PluginLifecycleEntryView } from 'acryl-harness-runtime'
import {
  runAcryl,
  type AcrylCliDependencies,
} from '../src/cli/run.ts'
import type { PluginCommandResult } from '../src/host/plugin-command.ts'

function setTty(ttys: readonly boolean[]): void {
  const [stdin, stdout] = ttys
  Object.defineProperty(process.stdin, 'isTTY', { value: stdin, configurable: true })
  Object.defineProperty(process.stdout, 'isTTY', { value: stdout, configurable: true })
}

const originalTty = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY')
afterEach(() => {
  if (originalTty !== undefined) {
    Object.defineProperty(process.stdin, 'isTTY', originalTty)
    Object.defineProperty(process.stdout, 'isTTY', originalTty)
  }
})

export function entry(
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

function snapshot(profile: string): PluginCommandResult & { readonly kind: 'snapshot' } {
  return {
    kind: 'snapshot',
    profile,
    engine: 'dsh',
    statePath: '/home/.acryl/plugin-lifecycle/state.json',
    snapshot: {
      entries: [
        entry('include:ui-acryl', { moduleName: '@acryl/dsh-client-ui-brand-acryl' }),
        entry('include:market-plugin', { enabled: false, hostPhase: null }),
      ],
    },
  }
}

function dependencies(overrides: Partial<AcrylCliDependencies> = {}): AcrylCliDependencies & {
  readonly events: string[]
} {
  const events: string[] = []
  return {
    events,
    startDirectHost: async options => {
      events.push(`host:${options.profile}`)
      return {
        runtimeState: 'ready',
        profile: options.profile,
        engine: 'dsh',
        generationId: 'generation-1',
        dispose: async () => { events.push('host:dispose') },
      }
    },
    runTui: async options => {
      events.push(`tui:${options.profile}${options.resumeSessionId === undefined ? '' : `:${options.resumeSessionId}`}`)
      return { resumeHint: 'resume-1' }
    },
    runPluginCommand: async options => {
      events.push(`plugin:${options.action}:${options.entryId ?? ''}:${options.profile}`)
      return snapshot(options.profile)
    },
    exit: code => { events.push(`exit:${code}`) },
    write: line => { events.push(`write:${line}`) },
    ...overrides,
  }
}

describe('runAcryl', () => {
  it('mounts the pi-tui session over the runtime bridge and prints a resume hint', async () => {
    setTty([true, true])
    const deps = dependencies()

    await runAcryl(['tui'], deps)

    expect(deps.events).toEqual(['tui:acryl', 'write:resume with: acryl tui --resume resume-1'])
  })

  it('passes --resume through to the pi-tui session', async () => {
    setTty([true, true])
    const deps = dependencies()

    await runAcryl(['tui', '--resume', 'abc-123'], deps)

    expect(deps.events).toEqual(['tui:acryl:abc-123', 'write:resume with: acryl tui --resume resume-1'])
  })

  it('writes a structured direct-host status for --json without mounting the TUI', async () => {
    const deps = dependencies()

    await runAcryl(['tui', '--profile', 'work', '--json'], deps)

    expect(deps.events).toEqual([
      'host:work',
      'write:{"mode":"direct","profile":"work","engine":"dsh","generationId":"generation-1"}',
      'host:dispose',
    ])
  })

  it('fails loud on a non-TTY stream instead of mounting the TUI', async () => {
    setTty([false, false])
    const deps = dependencies()

    await runAcryl(['tui'], deps)

    expect(deps.events).toEqual([
      'write:acryl-cli: stdin and stdout must both be TTYs; use `acryl tui --json` for a headless probe',
      'exit:1',
    ])
  })

  it('rejects web and gui with a clear surface-separation error (TUI-only CLI)', async () => {
    setTty([true, true])
    const deps = dependencies()

    await expect(runAcryl(['web'], deps)).rejects.toThrow(/acryl-web/i)
    await expect(runAcryl(['gui'], deps)).rejects.toThrow(/separate distribution|Electron/i)
  })

  it('lists plugins without needing a TTY', async () => {
    setTty([false, false])
    const deps = dependencies()

    await runAcryl(['plugin', 'list', '--profile', 'work'], deps)

    expect(deps.events).toEqual([
      'plugin:list::work',
      'write:profile work (dsh) - 2 plugins',
      'write:off include:market-plugin  acryl-plugin',
      'write:on  include:ui-acryl  @acryl/dsh-client-ui-brand-acryl',
      'write:override file: /home/.acryl/plugin-lifecycle/state.json',
    ])
  })

  it('defaults `acryl plugin` to the list action', async () => {
    const deps = dependencies()

    await runAcryl(['plugin'], deps)

    expect(deps.events[0]).toBe('plugin:list::acryl')
  })

  it('passes the plugin id through to a disable, and prints the receipt', async () => {
    const deps = dependencies({
      runPluginCommand: async options => {
        const entryId = options.entryId ?? ''
        return {
          kind: 'receipt',
          profile: options.profile,
          engine: 'dsh',
          statePath: '/home/.acryl/plugin-lifecycle/state.json',
          receipt: {
            accepted: true,
            action: options.action === 'enable' ? 'enable' : 'disable',
            entryIds: [entryId],
            snapshot: { entries: [entry(entryId, { enabled: false, hostPhase: null })] },
          },
        } satisfies PluginCommandResult
      },
    })

    await runAcryl(['plugin', 'disable', 'include:ui-acryl'], deps)

    expect(deps.events).toEqual([
      'write:disabled `include:ui-acryl` in profile acryl',
      'write:off include:ui-acryl  acryl-plugin',
      'write:override file: /home/.acryl/plugin-lifecycle/state.json',
    ])
  })

  it('prints the doctor report and fails the command on an error finding', async () => {
    const deps = dependencies({
      runPluginCommand: async () => ({
        kind: 'health',
        profile: 'acryl',
        engine: 'dsh',
        statePath: '/home/.acryl/plugin-lifecycle/state.json',
        report: {
          profileName: 'acryl',
          profileDir: '/home/.acryl/.dsh/profiles/acryl',
          statePath: '/home/.acryl/plugin-lifecycle/state.json',
          pluginCount: 2,
          findings: [
            {
              severity: 'error',
              code: 'state-unreadable',
              message: 'the override file is not valid JSON',
            },
          ],
        },
      }),
    })

    await runAcryl(['plugin', 'doctor'], deps)

    expect(deps.events).toEqual([
      'write:profile acryl (dsh) - 2 plugins',
      'write:1 finding(s), 1 error(s):',
      'write:error: the override file is not valid JSON',
      'write:override file: /home/.acryl/plugin-lifecycle/state.json',
      'exit:1',
    ])
  })

  it('emits one machine-readable line for `plugin list --json`', async () => {
    const deps = dependencies()

    await runAcryl(['plugin', 'list', '--json'], deps)

    const written = deps.events.filter(event => event.startsWith('write:'))
    expect(written).toHaveLength(1)
    expect(JSON.parse(written[0]!.slice('write:'.length))).toMatchObject({
      mode: 'plugin',
      action: 'list',
      profile: 'acryl',
      engine: 'dsh',
      statePath: '/home/.acryl/plugin-lifecycle/state.json',
    })
  })

  it('refuses install actions with a pointer to the surface that serves them', async () => {
    const deps = dependencies()

    await expect(runAcryl(['plugin', 'add', 'acryl-dsh-editor-plugin'], deps))
      .rejects.toThrow(/T006/)
    await expect(runAcryl(['plugin', 'remove', 'acryl-dsh-editor-plugin'], deps))
      .rejects.toThrow(/T006/)
    expect(deps.events).toEqual([])
  })
})
