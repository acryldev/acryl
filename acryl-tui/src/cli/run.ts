import { startDirectHost } from '../host/direct.ts'
import { runAcrylTui } from '../tui-app/session.ts'
import { ACRYL_VERSION } from '../version.ts'
import { parseAcrylArgs } from './grammar.ts'

interface RunningDirectHost {
  readonly runtimeState: 'ready' | 'unavailable'
  readonly profile: string
  readonly generationId: string
  dispose(): Promise<void>
}

export interface AcrylCliDependencies {
  readonly startDirectHost: (options: { profile: string }) => Promise<RunningDirectHost>
  readonly runTui: (options: { profile: string; resumeSessionId?: string }) => Promise<{ resumeHint: string }>
  readonly exit: (code: number) => void
  readonly write: (line: string) => void
}

const defaults: AcrylCliDependencies = {
  startDirectHost,
  runTui: runAcrylTui,
  exit: code => { process.exitCode = code },
  write: line => { process.stdout.write(`${line}\n`) },
}

function statusLine(host: RunningDirectHost): string {
  return JSON.stringify({
    mode: 'direct',
    profile: host.profile,
    generationId: host.generationId,
  })
}

/**
 * Run the direct ACRYL terminal host. `--json` is a short-lived, scriptable
 * headless readiness probe; interactive mode mounts the pi-tui session via the
 * runtime bridge until a normal exit, then prints a resumable session id.
 */
export async function runAcryl(
  args: readonly string[],
  supplied: Partial<AcrylCliDependencies> = {},
): Promise<void> {
  const dependencies = { ...defaults, ...supplied }
  const invocation = parseAcrylArgs(args)

  if (invocation.help) {
    dependencies.write(
      [
        'ACRYL - Agent Context Relay Yielding Lifecycles',
        '',
        `Usage: acryl [command] [options]`,
        '',
        'Commands:',
        '  tui    Run the terminal client (default)',
        '  gui    [reserved] launch the Desktop surface (not wired in this build)',
        '',
        'Options:',
        '  -h, --help          Show this help',
        '  -v, --version       Print the ACRYL version',
        '  --json              Emit machine-readable output',
        '  --profile <name>    Use a named ACRYL profile',
        '  --resume <id>       Resume a session',
        '',
      ].join('\n'),
    )
    return
  }

  if (invocation.version) {
    dependencies.write(ACRYL_VERSION)
    return
  }

  if (invocation.command === 'gui') {
    throw new Error(
      'ACRYL gui host is not implemented; the desktop (Electron) surface is not wired into this build yet. Use `pnpm acryl` for the terminal surface.',
    )
  }

  if (invocation.json) {
    const host = await dependencies.startDirectHost({ profile: invocation.profile ?? 'acryl' })
    try {
      dependencies.write(statusLine(host))
    } finally {
      await host.dispose()
    }
    return
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    dependencies.write('acryl-tui: stdin and stdout must both be TTYs; use `acryl tui --json` for a headless probe')
    dependencies.exit(1)
    return
  }

  const result = await dependencies.runTui({
    profile: invocation.profile ?? 'acryl',
    resumeSessionId: invocation.resumeSessionId,
  })
  dependencies.write(`resume with: acryl tui --resume ${result.resumeHint}`)
}
