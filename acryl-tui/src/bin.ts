import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { relaunchWithExposedInternals } from './cli/node-launcher.ts'
import { runAcryl } from './cli/run.ts'

export { parseAcrylArgs } from './cli/grammar.ts'
export type { AcrylHostCommand, AcrylInvocation } from './cli/grammar.ts'
export { runAcryl } from './cli/run.ts'
export type { AcrylCliDependencies } from './cli/run.ts'

function isEntrypoint(): boolean {
  const entrypoint = process.argv[1]
  return entrypoint !== undefined && resolve(entrypoint) === fileURLToPath(import.meta.url)
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
    const message = cause instanceof Error ? cause.message : String(cause)
    process.stderr.write(`acryl: ${message}\n`)
    process.exitCode = 1
  })
}
