/**
 * `npm run share [-- --owner <account>] [--visibility private|public]`: show what sharing this app would send, and ask. Only a plain yes at the
 * terminal sends it. --visibility decides who may see a new repository and is kept in blend.yaml (metadata.visibility).
 *   --json             print the plan as JSON and send nothing (what a program, or an agent, reads)
 *   --confirm <plan>   send exactly this plan (the JSON `--json` printed, as it is or base64url-encoded so no shell can change it), and nothing when
 *                      the app no longer matches it: for a person's own surface that showed them the plan and took their yes (the ACRYL
 *                      launcher's Share)
 *   --list             list it in the Blends store too (public only), as Community under your name; --category <address> and
 *                      --subcategory <address> place it (default: its earlier place, else its starter's category), --license <id> (default MIT)
 * Exits 1 when the share was refused.
 */
import { realpathSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import {
  adoptGithubToken,
  CATEGORIES_URL,
  type CatalogCategory,
  readCategories,
} from '@acryldev/app-persistence'
import { planShare, renderSharePlan, type SharePlan, type ShareResult, shareApp } from './share.ts'

function report(result: ShareResult): number {
  if (!result.ok) {
    console.error(`not shared: ${result.reason}`)
    for (const finding of result.secrets ?? [])
      console.error(`  ${finding.path}${finding.line ? `:${finding.line}` : ''}  ${finding.kind}`)
    return 1
  }
  console.log(`shared to ${result.remote}${result.created ? ' (created)' : ''}`)
  if (result.listed !== undefined)
    console.log(
      result.listed.created
        ? `listed in the Blends store from ${result.listed.tag}: acrylblends.github.io shows it within about an hour`
        : `${result.listed.tag} was already tagged, so the store keeps that version: raise the version in package.json to list this one`,
    )
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

/** The store's category list; without it (offline) a place is not checked here, and the store's sync still is. */
async function publishedCategories(): Promise<{ categories?: readonly CatalogCategory[] }> {
  try {
    const response = await fetch(CATEGORIES_URL, { signal: AbortSignal.timeout(10_000) })
    const categories = response.ok ? readCategories(await response.json()) : 'unreachable'
    return typeof categories === 'string' ? {} : { categories }
  } catch {
    return {}
  }
}

const HELP = `npm run share [-- options]: send this app to a GitHub repository of your own (through your gh login). The plan comes first; nothing is sent until you type yes.

  --owner <account>           the GitHub account or organization for a new repository (default: yours)
  --visibility private|public who may see a new repository (default: blend.yaml metadata.visibility, else private); kept in blend.yaml
  --list                      also list it in the Blends store (acrylblends.github.io and Control Center), as Community under your name; public only
  --category <address>        its category, one of acrylblends.github.io/blends (default: its earlier place, else its starter's category)
  --subcategory <address>     a subcategory of that category
  --license <id>              its licence when listed, an SPDX id (default MIT)
  --json                      print the plan as JSON and send nothing
  --confirm <plan>            send exactly this plan (the JSON --json printed); for a surface that showed a person the plan
  -h, --help                  this text

Example: npm run share -- --visibility public --list --category business --subcategory crm`

async function main(argv: readonly string[]): Promise<number> {
  // The GitHub sign-in made in Control Center or in an app (`~/.acryl/github.json`) is this share's login: gh and git start with it, and fall back to their own login without it.
  adoptGithubToken()
  const appRoot = fileURLToPath(new URL('../..', import.meta.url))
  const { values } = parseArgs({
    args: [...argv],
    strict: true,
    options: {
      owner: { type: 'string' },
      visibility: { type: 'string' },
      json: { type: 'boolean' },
      confirm: { type: 'string' },
      list: { type: 'boolean' },
      category: { type: 'string' },
      subcategory: { type: 'string' },
      license: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  })
  if (values.help === true) {
    console.log(HELP)
    return 0
  }
  if (
    values.visibility !== undefined &&
    values.visibility !== 'private' &&
    values.visibility !== 'public'
  ) {
    console.error('not shared: --visibility is private or public')
    return 1
  }
  const listing = values.list === true || values.category !== undefined
  const options = {
    ...(listing
      ? {
          list: {
            ...(values.category === undefined ? {} : { category: values.category }),
            ...(values.subcategory === undefined ? {} : { subcategory: values.subcategory }),
            ...(values.license === undefined ? {} : { license: values.license }),
          },
          ...(await publishedCategories()),
        }
      : {}),
    ...(values.owner === undefined ? {} : { owner: values.owner }),
    ...(values.visibility === undefined
      ? {}
      : { visibility: values.visibility as 'private' | 'public' }),
  }
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
