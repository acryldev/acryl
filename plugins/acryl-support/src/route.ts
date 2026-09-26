/** Same-origin handler for the diagnostics download. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { error, finishJson, isSameOriginLoopbackRequest } from 'acryl-loopback-http'
import type { DiagnosticsArchive } from 'acryl-diagnostics'

type ReportError = (operation: string, cause: unknown) => void

/** A file name that cannot break out of the header: letters, digits, dot, dash, underscore. */
function safeFileName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120)
}

/**
 * GET the archive. The build is synchronous file reading with a size cap; only one runs at a time so a
 * page that asks repeatedly cannot pile up work.
 */
export function createDiagnosticsRequestHandler(build: () => DiagnosticsArchive) {
  let busy = false
  return async function handleDiagnosticsRequest(
    req: IncomingMessage,
    res: ServerResponse,
    expectedOrigin: string,
    reportError: ReportError,
  ): Promise<void> {
    if (req.method !== 'GET') return finishJson(res, 405, error('method not allowed'), 'GET')
    if (!isSameOriginLoopbackRequest(req, expectedOrigin, false)) return finishJson(res, 403, error('forbidden'))
    if (busy) return finishJson(res, 429, error('a diagnostics export is already running'))
    busy = true
    try {
      const archive = build()
      res.statusCode = 200
      res.setHeader('cache-control', 'no-store')
      res.setHeader('content-type', 'application/zip')
      res.setHeader('content-length', String(archive.zip.byteLength))
      res.setHeader('content-disposition', `attachment; filename="${safeFileName(archive.fileName)}"`)
      res.setHeader('x-content-type-options', 'nosniff')
      res.end(archive.zip)
    } catch (cause) {
      reportError('build diagnostics archive', cause)
      finishJson(res, 500, error('the diagnostics archive could not be created'))
    } finally {
      busy = false
    }
  }
}
