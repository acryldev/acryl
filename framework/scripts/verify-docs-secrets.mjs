#!/usr/bin/env node
/**
 * No literal token, secret or password in what acrylblends ships into generated apps: the framework docs, the templates, the framework packages' source (their JSDoc examples)
 * and the package READMEs. Twice an example with a literal credential landed in ACRYL, and `save` then refused every generated app. The check is `save`'s own scan (`findSecrets`
 * from `@webboxes/app-persistence`, one rule for both), over the files git tracks there, tests excluded (their fixtures need literals). A literal credential in an example is read
 * from the environment instead (`process.env.JWT_SECRET!`).
 *
 *   node scripts/verify-docs-secrets.mjs
 */

import './lib/scratch-home.mjs'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOME = join(dirname(fileURLToPath(import.meta.url)), '..')
/** The folder whose tracked files are scanned: this repository; the test points it at a scratch repository. */
const ROOT = process.env.VERIFY_SECRETS_ROOT ?? HOME

/** What is scanned: the folders acrylblends copies into apps or prints in its docs, without tests. */
const SCANNED = [
  'docs/framework',
  'packages/cli/templates',
  'packages/cli/shared',
  'packages/cli/README.md',
  'packages/create/README.md',
  'packages/framework/src',
  'packages/framework/README.md',
  'plugins',
]
const TEST_FILE = /(^|\/)tests?\/|\.(test|spec|case)\.[cm]?[jt]sx?$/u
/** The notices and generated files the scan has no business in. */
const SKIPPED = /(^|\/)(pnpm-lock\.yaml|package-lock\.json|LICENSE[^/]*)$/u

function trackedFiles() {
  const listed = execFileSync('git', ['ls-files', '-z', '--', ...SCANNED], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  return listed
    .split('\0')
    .filter((path) => path !== '' && !TEST_FILE.test(path) && !SKIPPED.test(path))
    .flatMap((path) => {
      const buffer = readFileSync(join(ROOT, path))
      return buffer.includes(0) ? [] : [{ path, text: buffer.toString('utf8') }]
    })
}

// create-acrylblends depends on @webboxes/app-persistence; resolve it from there.
const { findSecrets } = createRequire(join(HOME, 'packages', 'create', 'package.json'))(
  '@webboxes/app-persistence',
)
const files = trackedFiles()
const findings = findSecrets(files)
for (const finding of findings)
  console.error(`${finding.path}:${String(finding.line)}  ${finding.kind}`)
if (findings.length > 0) {
  console.error(
    `verify-docs-secrets: ${String(findings.length)} secret(s) save would refuse; read them from the environment (process.env.NAME!)`,
  )
  process.exitCode = 1
} else
  console.log(`verify-docs-secrets: nothing save would refuse in ${String(files.length)} files`)
