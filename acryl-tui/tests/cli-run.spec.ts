import { describe, expect, it } from 'vitest'
import {
  runAcryl,
  type AcrylCliDependencies,
} from '../src/cli/run.ts'

function dependencies(overrides: Partial<AcrylCliDependencies> = {}): AcrylCliDependencies & {
  readonly events: string[]
} {
  const events: string[] = []
  return {
    events,
    stateDirectory: '/tmp/acryl-test',
    startDirectHost: async options => {
      events.push(`host:${options.profile}`)
      return {
        runtimeState: 'ready',
        profile: options.profile,
        generationId: 'generation-1',
        endpoint: { kind: 'unix', address: '/tmp/acryl-test/acryl.sock', protocolVersion: 1 },
        dispose: async () => { events.push('host:dispose') },
      }
    },
    createRenderer: async options => {
      events.push(`renderer:${options.profile}`)
      return {
        renderer: {},
        destroy: () => { events.push('renderer:destroy') },
      }
    },
    waitForRendererDestroy: async () => { events.push('renderer:wait') },
    write: line => { events.push(`write:${line}`) },
    ...overrides,
  }
}

describe('runAcryl', () => {
  it('boots a direct TUI host and disposes it after the renderer closes', async () => {
    const deps = dependencies()

    await runAcryl([], deps)

    expect(deps.events).toEqual([
      'host:acryl',
      'renderer:acryl',
      'renderer:wait',
      'renderer:destroy',
      'host:dispose',
    ])
  })

  it('prints a structured direct-host status for --json without opening a renderer', async () => {
    const deps = dependencies()

    await runAcryl(['tui', '--profile', 'work', '--json'], deps)

    expect(deps.events).toEqual([
      'host:work',
      'write:{"mode":"direct","profile":"work","generationId":"generation-1"}',
      'host:dispose',
    ])
  })

  it('cleans up the host when renderer startup fails', async () => {
    const deps = dependencies({
      createRenderer: async () => { throw new Error('terminal unavailable') },
    })

    await expect(runAcryl([], deps)).rejects.toThrow('terminal unavailable')
    expect(deps.events).toEqual(['host:acryl', 'host:dispose'])
  })
})
