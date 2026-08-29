import { startDirectHost } from '../host/direct.ts'
import { runAcrylTui } from '../tui-app/session.ts'
import { bootAcrylWebProfile } from 'acryl-harness-runtime'
import { ACRYL_VERSION } from '../version.ts'
import { parseAcrylArgs } from './grammar.ts'

interface RunningDirectHost {
  readonly runtimeState: 'ready' | 'unavailable'
  readonly profile: string
  readonly generationId: string
  dispose(): Promise<void>
}

export interface AcrylWebResult {
  readonly url: string
}

export interface AcrylCliDependencies {
  readonly startDirectHost: (options: { profile: string }) => Promise<RunningDirectHost>
  readonly runTui: (options: { profile: string; resumeSessionId?: string }) => Promise<{ resumeHint: string }>
  readonly runWeb: (options: { profile: string }) => Promise<AcrylWebResult>
  readonly exit: (code: number) => void
  readonly write: (line: string) => void
}

/** Boot the DSH browser surface as one ACRYL runtime, print its URL, and serve until a termination signal. */
async function serveWeb(): Promise<AcrylWebResult> {
  const runtime = await bootAcrylWebProfile({ cmdlineArgs: [] })
  const stopped = new Promise<void>(resolve => {
    const onSignal = () => resolve()
    process.once('SIGINT', onSignal)
    process.once('SIGTERM', onSignal)
  })
  const url = runtime.url
  process.stdout.write(`ACRYL web: ${url}\n`)
  await stopped
  await runtime.dispose()
  return { url }
}

const defaults: AcrylCliDependencies = {
  startDirectHost,
  runTui: runAcrylTui,
  runWeb: serveWeb,
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

  if (invocation.version) {
    dependencies.write(ACRYL_VERSION)
    return
  }

  if (invocation.command === 'gui') {
    throw new Error(
      'ACRYL gui host is not implemented; the desktop (Electron) surface is not wired into this build yet. Use `pnpm acryl` for the terminal surface.',
    )
  }

  if (invocation.command === 'web') {
    if (invocation.json) {
      // Headless readiness probe: boot the web runtime, print its URL, dispose.
      const host = await bootAcrylWebProfile({ cmdlineArgs: [] })
      try {
        dependencies.write(host.url)
      } finally {
        await host.dispose()
      }
      return
    }
    const result = await dependencies.runWeb({ profile: invocation.profile ?? 'web' })
    dependencies.write(`serving at ${result.url}`)
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
