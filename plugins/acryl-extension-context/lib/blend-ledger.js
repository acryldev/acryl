import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The Evolution Ledger of a Blend (governing Blends spec section 16, spec 036 blend-instance-design.md): an append-only record of what changed in a tracked composition,
 * by whom, and when. It exists only once a Blend has been captured (`<workspace>/.acryl/blend/blend.yaml`): from then on every install, update and removal of a plugin
 * in that workspace appends one line to `ledger.jsonl`. It is a log, not a store: the Blend files are the state, the ledger is the history.
 *
 * Each line is one JSON object `{ at, kind, actor, prev, ... }`. `prev` is the sha256 of the previous line's exact text (null for the first), so a line that is edited
 * or removed afterwards breaks the chain and `verifyLedger` names it. Lines are never rewritten; a correction is a new line. Appends use O_APPEND.
 */
const LEDGER = 'ledger.jsonl'
const sha256 = text => createHash('sha256').update(text).digest('hex')

/** The directory of a tracked Blend for a workspace, or undefined when the workspace has none. */
export function trackedBlendDir(workspaceDir, fs = { existsSync }) {
  if (typeof workspaceDir !== 'string' || workspaceDir === '') return undefined
  const dir = join(workspaceDir, '.acryl', 'blend')
  return fs.existsSync(join(dir, 'blend.yaml')) ? dir : undefined
}

function lastLine(file, fs) {
  if (!fs.existsSync(file)) return undefined
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)
  return lines.at(-1)
}

/**
 * Append one entry. `kind` is one of captured, applied, installed, updated, removed; `actor` is human (a command the user typed) or agent (a tool the model called).
 * @returns the entry as written
 */
export function appendLedger(blendDir, entry, fs = { existsSync, readFileSync }) {
  mkdirSync(blendDir, { recursive: true })
  const file = join(blendDir, LEDGER)
  const previous = lastLine(file, fs)
  const line = { at: new Date().toISOString(), ...entry, prev: previous === undefined ? null : sha256(previous) }
  appendFileSync(file, `${JSON.stringify(line)}\n`, { flag: 'a' })
  return line
}

/** The entries in order; a line that is not JSON is returned as `{ invalid: <text> }` so it can be reported rather than hidden. */
export function readLedger(blendDir, fs = { existsSync, readFileSync }) {
  const file = join(blendDir, LEDGER)
  if (!fs.existsSync(file)) return []
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(text => { try { return JSON.parse(text) } catch { return { invalid: text } } })
}

/** Check the hash chain. @returns `{ ok, problems, entries }` */
export function verifyLedger(blendDir, fs = { existsSync, readFileSync }) {
  const file = join(blendDir, LEDGER)
  if (!fs.existsSync(file)) return { ok: true, problems: [], entries: 0 }
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)
  const problems = []
  lines.forEach((text, index) => {
    let entry
    try { entry = JSON.parse(text) } catch { problems.push(`ledger line ${index + 1} is not valid JSON`); return }
    const expected = index === 0 ? null : sha256(lines[index - 1])
    if (entry.prev !== expected) problems.push(`ledger line ${index + 1} does not follow line ${index}: an earlier line was edited or removed`)
  })
  return { ok: problems.length === 0, problems, entries: lines.length }
}

/**
 * A recorder for install/remove services: appends to the tracked Blend of `workspaceDir` when there is one, and does nothing otherwise. Never throws (a ledger
 * failure must not undo an install).
 */
export function ledgerRecorder(workspaceDir, actor, fs = { existsSync, readFileSync }) {
  return entry => {
    try {
      const dir = trackedBlendDir(workspaceDir, fs)
      if (dir !== undefined) appendLedger(dir, { actor, ...entry }, fs)
    } catch { /* the ledger is history, not a gate */ }
  }
}
