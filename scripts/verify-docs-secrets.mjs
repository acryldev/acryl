#!/usr/bin/env node
/**
 * No literal token, secret or password in what ACRYLBLENDS ships into generated apps: the framework docs, the examples, the ported framework
 * sources (their JSDoc examples) and the release package. Twice an example with a literal credential landed here, and `save` then refused
 * every generated app. Two checks, both over the files git tracks there, tests excluded (their fixtures need literals):
 *
 *  - the exact scan `save` runs (`findSecrets` from `@webboxes/app-persistence`), so nothing here can make `save` refuse an app;
 *  - a stricter rule for examples: a quoted value assigned to a credential-named key (`password: '...'`, `const secret = "..."`). Read it
 *    from the environment instead (`process.env.JWT_SECRET!`).
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
export const SCANNED = ['docs/framework', 'examples', 'plugins/acryl-router/src', 'plugins/acryl-node-server/src', 'distribution/acrylblends-framework']
const TEST_FILE = /(^|\/)tests?\/|\.(test|spec)\.[cm]?[jt]sx?$/u

/** A quoted literal assigned to a key or variable named like a credential. A type (`secret: \`string\``) or an expression does not match. */
const LITERAL_CREDENTIAL = /\b(?:secret|password|passwd|token|api[_-]?key|private[_-]?key|client[_-]?secret)\b['"]?\s*[:=]\s*(['"])[^'"\n]{3,}\1/iu

/** Every finding in `files`: `save`'s own, then the literal-credential rule, one per line. */
export function scan(files, findSecrets) {
  const findings = findSecrets(files).map(finding => ({ path: finding.path, line: finding.line, kind: `save: ${finding.kind}` }))
  for (const file of files) {
    file.text.split('\n').forEach((text, at) => {
      if (LITERAL_CREDENTIAL.test(text)) findings.push({ path: file.path, line: at + 1, kind: 'literal credential' })
    })
  }
  return findings
}

function trackedFiles() {
  const listed = execFileSync('git', ['ls-files', '-z', '--', ...SCANNED], { cwd: ROOT, encoding: 'utf8' })
  return listed.split('\0').filter(path => path !== '' && !TEST_FILE.test(path)).flatMap(path => {
    const buffer = readFileSync(join(ROOT, path))
    return buffer.includes(0) ? [] : [{ path, text: buffer.toString('utf8') }]
  })
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { findSecrets } = await import(pathToFileURL(join(ROOT, 'runtime/app-persistence/dist/index.js')).href)
  const files = trackedFiles()
  const findings = scan(files, findSecrets)
  for (const finding of findings) console.error(`${finding.path}:${String(finding.line)}  ${finding.kind}`)
  if (findings.length > 0) {
    console.error(`verify-docs-secrets: ${String(findings.length)} literal credential(s); read them from the environment (process.env.NAME!)`)
    process.exitCode = 1
  } else console.log(`verify-docs-secrets: no literal credential in ${String(files.length)} files`)
}
