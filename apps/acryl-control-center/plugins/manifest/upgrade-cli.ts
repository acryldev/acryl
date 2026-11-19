/**
 * `npm run upgrade -- --from <old blueprint file> --to <new blueprint file> [--apply]`
 *
 * Plans the upgrade of this app's Blend to a newer version of its Blueprint and prints the plan (exit 1 when it is not safe). With
 * `--apply` and a safe plan, it moves `spec.lineage.blueprintVersion` and puts the new Blueprint in `blueprints/<id>.yaml`, where the
 * app finds it. Nothing else is changed; run `npm run lock` afterwards to record the new Blueprint's digest.
 */
import { copyFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { blueprintsIn, ManifestError } from './index.ts'
import { applyUpgrade, describePlan, planUpgrade } from './upgrade.ts'

export function runUpgrade(
  argv: readonly string[],
  appRoot: string,
  out: (text: string) => void = console.log,
): number {
  let args: ReturnType<typeof parse>
  try {
    args = parse(argv)
  } catch (error) {
    out(`error: ${(error as Error).message}`)
    return 2
  }
  const { from, to, apply } = args.values
  if (!from || !to) {
    out('usage: npm run upgrade -- --from <old blueprint file> --to <new blueprint file> [--apply]')
    return 2
  }
  const blueprints = join(appRoot, 'blueprints')
  try {
    const blendFile = join(appRoot, 'blend.yaml')
    const plan = planUpgrade({
      blendFile,
      oldBlueprint: resolve(from),
      newBlueprint: resolve(to),
      getBlueprint: blueprintsIn(blueprints),
    })
    out(describePlan(plan))
    if (!plan.safe) return 1
    if (apply) {
      applyUpgrade(blendFile, plan)
      mkdirSync(blueprints, { recursive: true })
      copyFileSync(resolve(to), join(blueprints, `${plan.blueprint}.yaml`))
      out(`applied: lineage is now ${plan.blueprint} ${plan.to}; run npm run lock to record it`)
    }
    return 0
  } catch (error) {
    out(
      `error: ${error instanceof ManifestError ? error.message : error instanceof Error ? error.message : String(error)}`,
    )
    return 1
  }
}

const parse = (argv: readonly string[]) =>
  parseArgs({
    args: [...argv],
    strict: true,
    options: { from: { type: 'string' }, to: { type: 'string' }, apply: { type: 'boolean' } },
  })

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runUpgrade(
    process.argv.slice(2),
    resolve(fileURLToPath(new URL('../..', import.meta.url))),
  )
}
