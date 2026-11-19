/**
 * A diagnostics zip for a support request: system facts plus the recent log files, with secrets masked.
 *
 * It reads only the surface's own log directory (regular files whose names the sink produced, never a link),
 * caps the total it will include, and never fails on one unreadable file. Surface-specific extras (Desktop's
 * crash dumps and lifecycle evidence) stay with that surface; this is the part every surface shares.
 */

import { lstatSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import AdmZip from 'adm-zip'
import { isDiagnosticLogFileName } from './log-files.ts'
import { maskSecrets } from './mask-secrets.ts'

/** The most log text one archive carries. */
export const DEFAULT_MAX_ARCHIVE_LOG_BYTES = 20 * 1024 * 1024

export interface DiagnosticsArchiveInput {
  readonly logsDir: string
  /** Which surface produced this (`web`, `desktop`, ...), recorded in system-info.txt. */
  readonly surface: string
  readonly appVersion: string
  readonly maxLogBytes?: number
  /** Injectable clock for tests. */
  readonly now?: () => Date
}

export interface DiagnosticsArchive {
  readonly zip: Buffer
  /** A file name for the download, unique per moment. */
  readonly fileName: string
  readonly includedLogFiles: number
  readonly skippedLogFiles: number
}

interface Candidate {
  readonly name: string
  readonly path: string
  readonly bytes: number
  readonly modifiedAt: number
}

function candidates(logsDir: string): Candidate[] {
  let names: string[]
  try {
    names = readdirSync(logsDir)
  } catch {
    return []
  }
  const found: Candidate[] = []
  for (const name of names) {
    if (!isDiagnosticLogFileName(name)) continue
    const path = join(logsDir, name)
    try {
      const stats = lstatSync(path)
      if (stats.isFile() && !stats.isSymbolicLink()) found.push({ name, path, bytes: stats.size, modifiedAt: stats.mtimeMs })
    } catch {
      // A file that vanishes or cannot be read is simply not included.
    }
  }
  return found.sort((a, b) => b.modifiedAt - a.modifiedAt || b.name.localeCompare(a.name))
}

const singleLine = (value: string): string => value.replace(/[\0\r\n]+/g, ' ').slice(0, 512)

export function buildDiagnosticsArchive(input: DiagnosticsArchiveInput): DiagnosticsArchive {
  const now = (input.now ?? (() => new Date()))()
  const maxBytes = input.maxLogBytes ?? DEFAULT_MAX_ARCHIVE_LOG_BYTES
  const zip = new AdmZip()
  let used = 0
  let included = 0
  let skipped = 0
  for (const file of candidates(input.logsDir)) {
    if (used + file.bytes > maxBytes) { skipped += 1; continue }
    try {
      // Lines were masked when written; mask again in case an older file predates a masking rule.
      zip.addFile(`logs/${file.name}`, Buffer.from(maskSecrets(readFileSync(file.path, 'utf8')), 'utf8'))
      used += file.bytes
      included += 1
    } catch {
      skipped += 1
    }
  }
  zip.addFile('system-info.txt', Buffer.from([
    `surface: ${singleLine(input.surface)}`,
    `version: ${singleLine(input.appVersion)}`,
    `generated: ${now.toISOString()}`,
    `platform: ${process.platform} ${process.arch}`,
    `node: ${process.version}`,
    `log files included: ${String(included)}`,
    `log files skipped (over the size cap or unreadable): ${String(skipped)}`,
    '',
  ].join('\n'), 'utf8'))
  zip.addFile('README.txt', Buffer.from('Secrets such as API keys, tokens and passwords are masked in these logs, but read them before sharing.\n', 'utf8'))
  const stamp = now.toISOString().replace(/[:.]/g, '-')
  return { zip: zip.toBuffer(), fileName: `acryl-diagnostics-${stamp}.zip`, includedLogFiles: included, skippedLogFiles: skipped }
}
