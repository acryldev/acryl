import { spawn } from 'node:child_process'

export interface ExposedInternalsLaunchInput {
  readonly execArgv: readonly string[]
  readonly script: string
  readonly args: readonly string[]
}

/** Return the child Node invocation required to expose Cordis HMR internals. */
export function exposedInternalsInvocation(
  input: ExposedInternalsLaunchInput,
): readonly string[] | undefined {
  if (input.execArgv.includes('--expose-internals')) return undefined
  return ['--expose-internals', ...input.execArgv, input.script, ...input.args]
}

/** Re-execute this CLI under Node with the Cordis HMR prerequisite enabled. */
export async function relaunchWithExposedInternals(
  input: ExposedInternalsLaunchInput,
): Promise<boolean> {
  const invocation = exposedInternalsInvocation(input)
  if (invocation === undefined) return false

  const exitCode = await new Promise<number>((resolve, reject) => {
    const child = spawn(process.execPath, invocation, { stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', code => resolve(code ?? 1))
  })
  process.exitCode = exitCode
  return true
}
