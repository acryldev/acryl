import { startDirectHost } from '../host/direct.ts'
import {
  runPluginCommand,
  type PluginCommandOptions,
  type PluginCommandResult,
} from '../host/plugin-command.ts'
import { runAcrylTui } from '../tui-app/session.ts'
import { ACRYL_VERSION } from '../version.ts'
import { runUiCommand } from '../host/ui-command.ts'
import { parseAcrylArgs, type AcrylPluginInvocation, type AcrylUiInvocation } from './grammar.ts'
import { renderPluginCommand } from './plugin-render.ts'
import { renderUiCommand } from './ui-render.ts'

interface RunningDirectHost {
  readonly runtimeState: 'ready' | 'unavailable'
  readonly profile: string
  readonly engine: string
  readonly generationId: string
  dispose(): Promise<void>
}

export interface AcrylCliDependencies {
  readonly startDirectHost: (options: { profile: string }) => Promise<RunningDirectHost>
  readonly runTui: (options: { profile: string; resumeSessionId?: string }) => Promise<{ resumeHint: string }>
  readonly runPluginCommand: (options: PluginCommandOptions) => Promise<PluginCommandResult>
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
  runPluginCommand,
  exit: code => { process.exitCode = code },
  write: line => { process.stdout.write(`${line}\n`) },
}

function statusLine(host: RunningDirectHost): string {
  return JSON.stringify({
    mode: 'direct',
    profile: host.profile,
    engine: host.engine,
    generationId: host.generationId,
  })
}

/**
 * Drive the shared plugin lifecycle for this profile and print what happened.
 *
 * `add`/`remove` are the install/reconcile actions (spec 034, T006). They are
 * recognized here so the command surface matches `plan.md`, and refused with a
 * pointer to the surface that can serve them today, rather than as an unknown
 * action a user would read as a typo.
 */
async function runPluginInvocation(
  invocation: AcrylPluginInvocation,
  dependencies: AcrylCliDependencies,
): Promise<void> {
  if (invocation.action === 'add' || invocation.action === 'remove') {
    throw new Error(
      `plugin ${invocation.action} lands with install/reconcile (spec 034, T006); `
      + 'install through the Desktop market today, or this profile\'s own package manager',
    )
  }
  const result = await dependencies.runPluginCommand({
    profile: invocation.profile ?? 'acryl',
    action: invocation.action,
    ...(invocation.entryId === undefined ? {} : { entryId: invocation.entryId }),
  })
  const rendered = renderPluginCommand(result, invocation.json)
  for (const line of rendered.lines) dependencies.write(line)
  if (rendered.exitCode !== 0) dependencies.exit(rendered.exitCode)
}

/**
 * Resolve a registry directory when `--registry` is not given: the
 * `ACRYL_UI_REGISTRY` environment variable, then the current directory (so
 * running the command from inside a cloned `acryl-ui-registry` just works).
 * Never guesses a network location - a registry is a directory on disk,
 * local clone or otherwise; fetching one is the user's own `git clone`.
 */
function defaultUiRegistryDir(): string {
  return process.env['ACRYL_UI_REGISTRY'] ?? process.cwd()
}

function runUiInvocation(invocation: AcrylUiInvocation, dependencies: AcrylCliDependencies): void {
  const result = runUiCommand({
    action: invocation.action,
    registryDir: invocation.registryDir ?? defaultUiRegistryDir(),
    ...(invocation.id === undefined ? {} : { id: invocation.id }),
    ...(invocation.targetDir === undefined ? {} : { targetDir: invocation.targetDir }),
    ...(invocation.surface === undefined ? {} : { surface: invocation.surface }),
  })
  const rendered = renderUiCommand(result, invocation.json)
  for (const line of rendered.lines) dependencies.write(line)
  if (rendered.exitCode !== 0) dependencies.exit(rendered.exitCode)
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
        '  tui                              Run the terminal client (default)',
        '  plugin                           List this profile\'s plugins (default action)',
        '  plugin list                      List plugins and their current state',
        '  plugin enable <id>               Enable a plugin for this profile',
        '  plugin disable <id>              Disable a plugin for this profile',
        '  plugin doctor                    Check a profile\'s plugin layer',
        '  ui list                          List a UI component registry\'s items',
        '  ui add <id> <dir>                Copy a component\'s source into <dir>/ui/',
        '  ui diff <id> <dir>               Compare an added component against the registry',
        '',
        'Options:',
        '  -h, --help          Show this help',
        '  -v, --version       Print the ACRYL version',
        '  --json              Emit machine-readable output',
        '  --profile <name>    Use a named ACRYL profile',
        '  --resume <id>       Resume a session',
        '  --registry <dir>    Registry directory for ui commands (default: $ACRYL_UI_REGISTRY or cwd)',
        '  --surface <name>    web or tui, for `ui add` (default: the item\'s first surface)',
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

  if (invocation.kind === 'ui') {
    runUiInvocation(invocation, dependencies)
    return
  }

  if (invocation.kind === 'plugin') {
    await runPluginInvocation(invocation, dependencies)
    return
  }

  if (invocation.command === 'web') throw surfaceError('web')
  if (invocation.command === 'gui') throw surfaceError('gui')

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
    dependencies.write('acryl-cli: stdin and stdout must both be TTYs; use `acryl tui --json` for a headless probe')
    dependencies.exit(1)
    return
  }

  const result = await dependencies.runTui({
    profile: invocation.profile ?? 'acryl',
    resumeSessionId: invocation.resumeSessionId,
  })
  dependencies.write(`resume with: acryl tui --resume ${result.resumeHint}`)
}
