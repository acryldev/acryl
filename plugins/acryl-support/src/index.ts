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
import type {} from 'acryl-control'
import { buildDiagnosticsArchive, FileExporter, LogFileSink } from 'acryl-diagnostics'
import { SUPPORT_DIAGNOSTICS_PATH } from './contract.ts'
import { createDiagnosticsRequestHandler } from './route.ts'

export const name = 'acryl-support'
/**
 * The part of the runtime's `appInstance` service ACRYL plugins read (a separated interface: plugins do not import the runtime). Every plugin declares
 * exactly this shape, so the Context augmentations agree in any program that loads several of them.
 */
interface AppInstanceService {
  readonly home: string
  readonly dshHome: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    appInstance: AppInstanceService
  }
}

export const inject = ['acrylWeb', 'appInstance']

const pluginVersion = (createRequire(import.meta.url)('../package.json') as { version: string }).version

export function apply(ctx: Context): void {
  const origin = `http://127.0.0.1:${String(ctx.acrylWeb.port)}`
  const report = (operation: string, cause: unknown): void => {
    ctx.logger.error(`acryl-support: failed to ${operation}: ${cause instanceof Error ? cause.message : String(cause)}`)
  }
  // Where this app's engine home keeps logs (from the `appInstance` service, never a looked-up home).
  const logsDir = join(ctx.appInstance.dshHome, 'logs')

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
    const release = ctx.acrylWeb.register({
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
