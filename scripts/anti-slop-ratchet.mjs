/**
 * The anti-slop ratchet (scripts/oxlint/anti-slop, every rule at "error" in .oxlintrc.json). ACRYL had findings in its own source when the
 * rules came in (2026-11-19), so `pnpm run lint` reports them all, and `pnpm run check` runs this ratchet instead: the count per rule may
 * not rise above its ceiling in scripts/anti-slop-ceiling.json. New slop fails the gate; a fix lowers the count, and `--lower` writes the
 * lower counts back as the new ceiling (it never raises one). A rule missing from the file has ceiling 0.
 *
 *   node scripts/anti-slop-ratchet.mjs [--lower]
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const CEILING_FILE = join(root, 'scripts', 'anti-slop-ceiling.json')

/** Findings per rule, from oxlint's JSON report. */
export function countByRule(report) {
  const counts = {}

  for (const diagnostic of report.diagnostics ?? []) counts[diagnostic.code] = (counts[diagnostic.code] ?? 0) + 1

  return counts
}

/** The rules whose count rose above their ceiling, one sentence each. */
export function overCeiling(counts, ceiling) {
  return Object.entries(counts)
    .filter(([rule, count]) => count > (ceiling[rule] ?? 0))
    .map(([rule, count]) => `${rule}: ${count} findings, the ceiling is ${ceiling[rule] ?? 0}`)
    .sort()
}

/** The ceiling lowered to today's counts (a rule at 0 drops out); never raised. */
export function lowered(counts, ceiling) {
  return Object.fromEntries(
    Object.entries(ceiling)
      .map(([rule, max]) => [rule, Math.min(max, counts[rule] ?? 0)])
      .filter(([, max]) => max > 0)
      .sort(([a], [b]) => a.localeCompare(b)),
  )
}

function run() {
  // oxlint exits 0 with no findings and 1 with some; either way its JSON report is on stdout. Anything else is a failure to lint.
  const linted = spawnSync(join(root, 'node_modules', '.bin', 'oxlint'), ['--disable-nested-config', '--format=json'], { cwd: root, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 })

  if (linted.error !== undefined) throw linted.error

  if (linted.status !== 0 && linted.status !== 1) throw new Error(`anti-slop: oxlint exited ${String(linted.status)}: ${linted.stderr}`)
  const output = linted.stdout
  const counts = countByRule(JSON.parse(output))
  const ceiling = JSON.parse(readFileSync(CEILING_FILE, 'utf8'))

  if (process.argv.includes('--lower')) {
    writeFileSync(CEILING_FILE, `${JSON.stringify(lowered(counts, ceiling), null, 2)}\n`)
    process.stdout.write('anti-slop: ceiling lowered to today\'s counts\n')

    return
  }

  const risen = overCeiling(counts, ceiling)

  if (risen.length > 0) {
    process.stderr.write(`anti-slop: new findings (run pnpm run lint to see them; fix them, do not raise the ceiling):\n${risen.map(line => `  ${line}`).join('\n')}\n`)
    process.exit(1)
  }

  const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
  const room = Object.entries(ceiling).filter(([rule, max]) => (counts[rule] ?? 0) < max).length
  process.stdout.write(`anti-slop: ${total} findings, none above the ceiling${room > 0 ? `; ${room} rule(s) below it: run node scripts/anti-slop-ratchet.mjs --lower` : ''}\n`)
}

if (import.meta.url === `file://${process.argv[1]}`) run()
