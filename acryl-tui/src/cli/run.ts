import { startDirectHost } from '../host/direct.ts'
import { runAcrylTui } from '../tui-app/session.ts'
import { ACRYL_VERSION } from '../version.ts'
import { parseAcrylArgs } from './grammar.ts'
import { bootAcrylAcpProfile } from 'acryl-harness-runtime'

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

/**
 * The `acryl` CLI is the terminal surface only. The browser (`acryl web`) and
 * Electron (`acryl gui`) surfaces are separate distributions and are NOT wired
 * into this package, so the CLI stays lightweight and does not pull the
 * `dsh-web-app` / host / client bundle into its publish closure.
 */
function surfaceError(command: 'web' | 'gui'): Error {
  if (command === 'web') {
    return new Error(
      '`acryl web` is served by the separate `acryl-web` distribution. Install it separately; the `acryl` CLI is the terminal (TUI) surface only.',
    )
  }
  return new Error(
    '`acryl gui` (Electron Desktop) is a separate distribution and is not wired into the `acryl` CLI package. Use the desktop installer.',
  )
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
 * Run the ACRYL terminal host. `--json` is a short-lived, scriptable
 * readiness probe; interactive mode mounts the pi-tui session via the
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
        '  acp    Serve as an ACP agent over JSON-RPC stdio',
        '',
        'Options:',
        '  -h, --help          Show this help',
        '  -v, --version       Print the ACRYL version',
        '  --json              Emit machine-readable output',
        '  --profile <name>    Use a named ACRYL profile',
        '  --resume <id>       Resume a session',
        '',
        'The browser (`acryl web`) and Electron (`acryl gui`) surfaces are ',
        'separate distributions. Install them individually.',
        '',
      ].join('\n'),
    )
    return
  }

  if (invocation.version) {
    dependencies.write(ACRYL_VERSION)
    return
  }

  if (invocation.command === 'web') throw surfaceError('web')
  if (invocation.command === 'gui') throw surfaceError('gui')

  if (invocation.command === 'acp') {
    const runtime = await bootAcrylAcpProfile()
    const shutdown = async (): Promise<void> => {
      await runtime.dispose()
    }
    process.on('SIGTERM', () => { void shutdown().then(() => process.exit(0)) })
    process.on('SIGINT', () => { void shutdown().then(() => process.exit(130)) })
    return
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
