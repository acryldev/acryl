/**
 * Cordis Host plugin: file logging and the diagnostics download for the Web surface.
 *
 * Web had no persistent logs. This plugin attaches the shared file sink to the Cordis logger for its own
 * lifetime (one effect, disposed with the plugin) and serves the shared support archive. Desktop keeps its
 * own richer export behind the tray; both use the same masking, sink and archive builder from
 * `acryl-diagnostics`.
 */

import { createRequire } from 'node:module'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { buildDiagnosticsArchive, FileExporter, LogFileSink } from 'acryl-diagnostics'
import { SUPPORT_DIAGNOSTICS_PATH } from './contract.ts'
import { createDiagnosticsRequestHandler } from './route.ts'

export const name = 'acryl-support'
export const inject = ['webServer']

const pluginVersion = (createRequire(import.meta.url)('../package.json') as { version: string }).version

export function apply(ctx: Context): void {
  const origin = `http://127.0.0.1:${String(ctx.webServer.port)}`
  const report = (operation: string, cause: unknown): void => {
    ctx.logger.error(`acryl-support: failed to ${operation}: ${cause instanceof Error ? cause.message : String(cause)}`)
  }
  // Where the DSH home puts logs (`ACRYL_HOME` has already pointed `DSH_HOME` at its `.dsh`).
  const logsDir = join(resolveDshHome(), 'logs')

  ctx.effect(() => {
    let sink: LogFileSink | undefined
    try {
      sink = new LogFileSink(logsDir, { maxFileBytes: 10 * 1024 * 1024, maxDirectoryBytes: 200 * 1024 * 1024 })
      sink.enforceDirectoryCap()
      sink.purgeOlderThan(7)
      sink.writeHeader(`--- acryl web ${pluginVersion} ${process.platform} node ${process.version} run ${String(Date.now())} ---`)
      ctx.logger.exporter(new FileExporter(sink))
    } catch (cause) {
      // Logging is best effort: the app must run without it.
      report('start file logging', cause)
    }
    const handle = createDiagnosticsRequestHandler(() => buildDiagnosticsArchive({
      logsDir,
      surface: 'web',
      appVersion: `acryl-support ${pluginVersion}`,
    }))
    const release = ctx.webServer.register({
      kind: 'exact',
      path: SUPPORT_DIAGNOSTICS_PATH,
      handler: (req, res) => handle(req, res, origin, report),
    })
    return () => {
      release()
      sink?.close()
    }
  }, 'acryl-support: file logging and the diagnostics route')
}

export { SUPPORT_DIAGNOSTICS_PATH } from './contract.ts'
