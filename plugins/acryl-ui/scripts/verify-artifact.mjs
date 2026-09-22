#!/usr/bin/env node
// Artifact freshness check (spec 038-ui-component-library). Closes a hole found during T045: the
// built-bundle suite is skipped when lib/client.js is absent, so a stale artifact - or a build that
// silently failed - could still report green. Two real failures came from exactly that: a served
// @acryl/ui bundle without the newest components (React #130 in the app), and a `pnpm run build |
// tail` that masked the build's own exit code.
//
// Run this from the batch gate (`pnpm run check`), after `pnpm run build`. Exits non-zero when the
// bundle is missing, or older than any file it is built from.

import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BUNDLE = join(ROOT, 'lib', 'client.js')
const SOURCE_ROOT = join(ROOT, 'src', 'client')

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

if (!existsSync(BUNDLE)) {
  console.error('verify-artifact: lib/client.js is missing - run `pnpm run build` before trusting a test run')
  process.exitCode = 1
} else {
  const bundleMtime = statSync(BUNDLE).mtimeMs
  const sources = walk(SOURCE_ROOT).filter(file => /\.(?:ts|tsx|css)$/u.test(file))
  const stale = sources.filter(file => statSync(file).mtimeMs > bundleMtime)
  if (stale.length > 0) {
    console.error(`verify-artifact: lib/client.js is older than ${stale.length} source file(s) - rebuild before trusting a test run:`)
    for (const file of stale.slice(0, 10)) console.error(`  - ${file.slice(ROOT.length + 1)}`)
    process.exitCode = 1
  } else {
    console.log(`verify-artifact: lib/client.js is newer than all ${sources.length} source file(s)`)
  }
}