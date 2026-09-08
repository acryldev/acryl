/**
 * A durable, cross-surface debug log for ACRYL sessions.
 *
 * Cordis's own `ctx.logger` already carries every structured log record any
 * plugin emits, but nothing in this stack persisted it anywhere — a failure
 * like a vendored provider's OAuth error only ever reached the terminal
 * transcript, gone the moment the pane scrolled or the process exited. This
 * registers one JSONL file exporter on `ctx.logger` per surface (CLI/TUI,
 * web, and — once wired there too — the desktop GUI), so `error`/`warn`
 * records (and everything, when `ACRYL_LOG_LEVEL=debug`) survive the session
 * and can be read back after the fact instead of re-derived from a
 * screenshot.
 *
 * @module acryl-harness-runtime/session-log-exporter
 */

import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'

export interface InstallSessionLogExporterOptions {
  /** Which ACRYL surface this process is (`tui`, `web`, `desktop`) — becomes part of the log filename. */
  readonly surface: string
  /** Harness home override; defaults to `$DSH_HOME`/`~/.dsh` exactly like credentials/settings resolve it. */
  readonly dshHome?: string
}

const LOGGER_LEVEL_WARN = 2
const LOGGER_LEVEL_DEBUG = 3

/**
 * Register the file exporter for this process's lifetime. `ctx.logger.exporter()`
 * already ties its own disposal to the fiber that registers it (see
 * `LoggerService.exporter` in `@deepseek-ai/cordis`), so this needs no extra
 * `ctx.effect()` wrapper of its own.
 * @param ctx - the plugin context whose `ctx.logger` gains the exporter.
 * @param options - which surface/home this log file belongs to.
 */
export function installSessionLogExporter(ctx: Context, options: InstallSessionLogExporterOptions): void {
  const dshHome = resolveDshHome(options.dshHome)
  const logDir = join(dshHome, 'logs')
  try {
    mkdirSync(logDir, { recursive: true, mode: 0o700 })
  } catch {
    return // best-effort diagnostics only; a session must never fail to start over this
  }
  const day = new Date().toISOString().slice(0, 10)
  const logFile = join(logDir, `acryl-${options.surface}-${day}.jsonl`)
  const threshold = process.env.ACRYL_LOG_LEVEL === 'debug' ? LOGGER_LEVEL_DEBUG : LOGGER_LEVEL_WARN

  ctx.logger.exporter({
    export(message) {
      if (message.level > threshold) return
      try {
        appendFileSync(logFile, `${JSON.stringify({
          ts: new Date(message.ts).toISOString(),
          type: message.type,
          name: message.name,
          args: message.args.map(arg => (arg instanceof Error
            ? { message: arg.message, stack: arg.stack, name: arg.name }
            : arg)),
        })}\n`, { mode: 0o600 })
      } catch {
        // best-effort: a write failure here must never take a session down
      }
    },
  })
}
