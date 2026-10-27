/**
 * The audit log: one JSON line per door call, append-only, in the app's own `.acryl/audit/` (moved from `acryl-agent-control`, spec 041).
 *
 * It is the record of what the agent did to the app. It never holds text the agent typed or values it read,
 * only which control was touched and how the call ended.
 */

import { closeSync, mkdirSync, openSync, readFileSync, renameSync, statSync, writeSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AuditEntry } from '../page/protocol.ts'

export type { AuditEntry } from '../page/protocol.ts'

const MAX_LOG_BYTES = 5 * 1024 * 1024

/** The audit log below a folder the caller owns (the app's `.acryl/` here; ACRYL's app home for the DSH face). */
export function auditPath(folder: string): string {
  return join(folder, 'audit', 'ui-control.jsonl')
}

export class AuditLog {
  private readonly path: string

  constructor(path: string) {
    this.path = path
  }

  /** Append one line; a failing disk never breaks the tool call. */
  record(entry: AuditEntry): void {
    try {
      mkdirSync(dirname(this.path), { recursive: true })
      this.rotateIfLarge()
      const fd = openSync(this.path, 'a', 0o600)
      try {
        writeSync(fd, `${JSON.stringify(entry)}\n`)
      } finally {
        closeSync(fd)
      }
    } catch {
      // Best effort: the record is important, but the app must keep working.
    }
  }

  /** The most recent entries, oldest first. */
  recent(limit = 100): AuditEntry[] {
    try {
      const lines = readFileSync(this.path, 'utf8').split('\n').filter(line => line !== '').slice(-limit)
      return lines.flatMap((line) => {
        try { return [JSON.parse(line) as AuditEntry] } catch { return [] }
      })
    } catch {
      return []
    }
  }

  private rotateIfLarge(): void {
    try {
      if (statSync(this.path).size >= MAX_LOG_BYTES) renameSync(this.path, `${this.path}.1`)
    } catch {
      // Nothing to rotate yet.
    }
  }
}

