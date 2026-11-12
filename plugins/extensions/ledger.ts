/**
 * The ledger: one JSON line per change to the installed extensions, appended, never rewritten. Extracted from ACRYL's evolution ledger
 * (`blend-ledger.js`): what was installed, updated, removed or refused, when, and the content digest of the version involved.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'

export type LedgerKind =
  | 'installed'
  | 'updated'
  | 'removed'
  | 'refused'
  | 'restored'
  | 'requested'
  | 'approved'
  | 'denied'

export interface LedgerEntry {
  readonly at: string
  readonly kind: LedgerKind
  readonly name: string
  readonly version?: string
  readonly error?: string
}

export function appendLedger(file: string, entry: Omit<LedgerEntry, 'at'>): LedgerEntry {
  const line: LedgerEntry = { at: new Date().toISOString(), ...entry }
  mkdirSync(dirname(file), { recursive: true })
  appendFileSync(file, `${JSON.stringify(line)}\n`)
  return line
}

export function readLedger(file: string): LedgerEntry[] {
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as LedgerEntry)
}
