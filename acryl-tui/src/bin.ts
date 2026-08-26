import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
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
  void runAcryl(process.argv.slice(2)).catch((cause: unknown) => {
    const message = cause instanceof Error ? cause.message : String(cause)
    process.stderr.write(`acryl: ${message}\n`)
    process.exitCode = 1
  })
}
