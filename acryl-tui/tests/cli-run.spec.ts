import { afterEach, describe, expect, it } from 'vitest'
import {
  runAcryl,
  type AcrylCliDependencies,
} from '../src/cli/run.ts'

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
        generationId: 'generation-1',
        dispose: async () => { events.push('host:dispose') },
      }
    },
    runTui: async options => {
      events.push(`tui:${options.profile}${options.resumeSessionId === undefined ? '' : `:${options.resumeSessionId}`}`)
      return { resumeHint: 'resume-1' }
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
      'write:{"mode":"direct","profile":"work","generationId":"generation-1"}',
      'host:dispose',
    ])
  })

  it('fails loud on a non-TTY stream instead of mounting the TUI', async () => {
    setTty([false, false])
    const deps = dependencies()

    await runAcryl(['tui'], deps)

    expect(deps.events).toEqual([
      'write:acryl-tui: stdin and stdout must both be TTYs; use `acryl tui --json` for a headless probe',
      'exit:1',
    ])
  })

  it('rejects the deferred web command and keeps gui explicitly unavailable', async () => {
    setTty([true, true])
    const deps = dependencies()

    await expect(runAcryl(['web'], deps)).rejects.toThrow('unknown command: web')
    await expect(runAcryl(['gui'], deps)).rejects.toThrow(/desktop \(Electron\) surface is not wired into this build yet/)
  })
})
