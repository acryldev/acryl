#!/usr/bin/env node
// acryl-secret-check [dir]
// The same secret check `acryl save` runs, over every file git tracks in an app: what its CI runs, so a key committed outside ACRYL is caught too.
// Exit codes: 0 clean, 1 a finding, 2 not a git repository.
import { spawnSync } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findSecrets } from '../secrets.js'

export function main(argv: readonly string[], out: (line: string) => void = line => { process.stdout.write(`${line}\n`) }): number {
  const root = resolve(argv[0] ?? '.')
  const listed = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
  if (listed.status !== 0) { out(`${root} is not a git repository`); return 2 }
  const files = listed.stdout.split('\0').filter(Boolean).flatMap(path => {
    let buffer: Buffer
    try { buffer = readFileSync(join(root, path)) } catch { return [] }
    return buffer.includes(0) ? [] : [{ path, text: buffer.toString('utf8') }]   // binary files are not scanned
  })
  const findings = findSecrets(files)
  for (const finding of findings) out(`${finding.path}${finding.line > 0 ? `:${String(finding.line)}` : ''}  ${finding.kind}`)
  out(findings.length === 0 ? `no secrets in ${String(files.length)} tracked files` : `${String(findings.length)} possible secret(s): move them out of the repository, then rewrite the history that contains them`)
  return findings.length === 0 ? 0 : 1
}

function isEntryPoint(): boolean {
  const started = process.argv[1]
  if (started === undefined) return false
  try { return realpathSync(started) === realpathSync(fileURLToPath(import.meta.url)) } catch { return false }
}

if (isEntryPoint()) process.exitCode = main(process.argv.slice(2))
