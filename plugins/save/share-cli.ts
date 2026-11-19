/**
 * `npm run share [-- --owner <account>]`: show what sharing this app would send, and ask. Only a plain yes at the terminal sends it.
 *   --json             print the plan as JSON and send nothing (what a program, or an agent, reads)
 *   --confirm <plan>   send exactly this plan (the JSON `--json` printed, as it is or base64url-encoded so no shell can change it), and nothing when
 *                      the app no longer matches it: for a person's own surface that showed them the plan and took their yes (the ACRYL
 *                      launcher's Share)
 * Exits 1 when the share was refused.
 */
import { realpathSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { planShare, renderSharePlan, type SharePlan, type ShareResult, shareApp } from './share.ts'

function report(result: ShareResult): number {
  if (!result.ok) {
    console.error(`not shared: ${result.reason}`)
    for (const finding of result.secrets ?? [])
      console.error(`  ${finding.path}${finding.line ? `:${finding.line}` : ''}  ${finding.kind}`)
    return 1
  }
  console.log(`shared to ${result.remote}${result.created ? ' (created)' : ''}`)
  return 0
}

const isPlan = (value: unknown): value is SharePlan =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as SharePlan).repository === 'string' &&
  typeof (value as SharePlan).create === 'boolean' &&
  ((value as SharePlan).visibility === 'private' || (value as SharePlan).visibility === 'public') &&
  typeof (value as SharePlan).changes === 'number'

/** The plan a program hands back: JSON, or the same JSON base64url-encoded. */
function readPlan(text: string): unknown {
  for (const candidate of [text, Buffer.from(text, 'base64url').toString('utf8')]) {
    try {
      return JSON.parse(candidate)
    } catch {
      // not this form
    }
  }
  return undefined
}

async function main(argv: readonly string[]): Promise<number> {
  const appRoot = fileURLToPath(new URL('../..', import.meta.url))
  const { values } = parseArgs({
    args: [...argv],
    strict: true,
    options: { owner: { type: 'string' }, json: { type: 'boolean' }, confirm: { type: 'string' } },
  })
  const options = values.owner === undefined ? {} : { owner: values.owner }
  if (values.confirm !== undefined) {
    const confirmed = readPlan(values.confirm)
    if (!isPlan(confirmed)) {
      console.error('not shared: --confirm takes the plan that --json printed')
      return 1
    }
    const result = shareApp(appRoot, confirmed, options)
    if (values.json === true) {
      console.log(JSON.stringify(result))
      return result.ok ? 0 : 1
    }
    return report(result)
  }
  const plan = planShare(appRoot, options)
  if (values.json === true) {
    console.log(JSON.stringify(plan))
    return 'ok' in plan ? 1 : 0
  }
  if ('ok' in plan) return report(plan)
  console.log(renderSharePlan(plan))
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.log(
      'Nothing was sent. Only a person can say yes: they run `npm run share` in their own terminal.',
    )
    return 0
  }
  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  const answer = (await prompt.question('Type yes to send it: ')).trim().toLowerCase()
  prompt.close()
  if (answer !== 'yes') {
    console.log('Nothing was sent.')
    return 0
  }
  return report(shareApp(appRoot, plan, options))
}

// The real path on both sides: a folder reached through a link (macOS's /tmp) is still this file.
if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
)
  process.exitCode = await main(process.argv.slice(2))
