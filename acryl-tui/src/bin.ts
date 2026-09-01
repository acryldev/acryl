import { fileURLToPath } from 'node:url'
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { relaunchWithExposedInternals } from './cli/node-launcher.ts'
import { runAcryl } from './cli/run.ts'

export { parseAcrylArgs } from './cli/grammar.ts'
export type { AcrylHostCommand, AcrylInvocation } from './cli/grammar.ts'
export { runAcryl } from './cli/run.ts'
export type { AcrylCliDependencies } from './cli/run.ts'

function isEntrypoint(): boolean {
  const entrypoint = process.argv[1]
  if (entrypoint === undefined) return false
  // Compare canonical paths: Node resolves import.meta.url to the real path, so
  // a script reached through a symlink (e.g. /tmp -> /private/tmp, or a portable
  // archive extracted anywhere) must be canonicalized before comparison.
  try {
    return realpathSync(entrypoint) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return resolve(entrypoint) === fileURLToPath(import.meta.url)
  }
}

if (isEntrypoint()) {
  void (async () => {
    const script = process.argv[1]
    if (script === undefined) throw new Error('ACRYL Node entrypoint is unavailable')
    const relaunched = await relaunchWithExposedInternals({
      execArgv: process.execArgv,
      script,
      args: process.argv.slice(2),
    })
    if (relaunched) return
    await runAcryl(process.argv.slice(2))
  })().catch((cause: unknown) => {
    if (cause instanceof AggregateError) {
      for (const error of cause.errors) {
        if (error instanceof Error) process.stderr.write(`acryl: ${error.stack ?? error.message}\n`)
        else process.stderr.write(`acryl: ${String(error)}\n`)
      }
    } else {
      process.stderr.write(`acryl: ${cause instanceof Error ? cause.message : String(cause)}\n`)
    }
    process.exitCode = 1
  })
}
