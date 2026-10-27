#!/usr/bin/env node
/**
 * No literal token, secret or password in the examples, which apps are started from (the framework's docs, sources and release package
 * moved to the acrylblends repository and are scanned there). Twice an example with a literal credential landed here, and `save` then refused
 * every generated app. The check is `save`'s own scan (`findSecrets` from `@webboxes/app-persistence`, one rule for both), over the files git
 * tracks there, tests excluded (their fixtures need literals). A literal credential in an example is read from the environment instead
 * (`process.env.JWT_SECRET!`).
 *
 *   node scripts/verify-docs-secrets.mjs
 *
 * Needs `runtime/app-persistence` built (the root `check` builds it first).
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** What is scanned: the folders ACRYLBLENDS copies into apps, without tests. */
const SCANNED = ['examples']
const TEST_FILE = /(^|\/)tests?\/|\.(test|spec)\.[cm]?[jt]sx?$/u

function trackedFiles() {
  const listed = execFileSync('git', ['ls-files', '-z', '--', ...SCANNED], { cwd: ROOT, encoding: 'utf8' })
  return listed.split('\0').filter(path => path !== '' && !TEST_FILE.test(path)).flatMap(path => {
    const buffer = readFileSync(join(ROOT, path))
    return buffer.includes(0) ? [] : [{ path, text: buffer.toString('utf8') }]
  })
}

const { findSecrets } = await import(pathToFileURL(join(ROOT, 'runtime/app-persistence/dist/index.js')).href)
const files = trackedFiles()
const findings = findSecrets(files)
for (const finding of findings) console.error(`${finding.path}:${String(finding.line)}  ${finding.kind}`)
if (findings.length > 0) {
  console.error(`verify-docs-secrets: ${String(findings.length)} secret(s) save would refuse; read them from the environment (process.env.NAME!)`)
  process.exitCode = 1
} else console.log(`verify-docs-secrets: nothing save would refuse in ${String(files.length)} files`)
