/** Same-origin route for the diagnostics download. */

import { Acryl } from 'acrylblends'
import { error } from 'acryl-loopback-http'
import { ownPage, privateApi, type ReportError } from 'acryl-loopback-http/router'
import type { DiagnosticsArchive } from 'acryl-diagnostics'
import { SUPPORT_API_PREFIX, SUPPORT_DIAGNOSTICS_PATH } from './contract.ts'

/** A file name that cannot break out of the header: letters, digits, dot, dash, underscore. */
function safeFileName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120)
}

/**
 * GET the archive, from the app's own page only, under the shared private-route rules (405 with `Allow` for another method). The build
 * is synchronous file reading with a size cap; only one runs at a time so a page that asks repeatedly cannot pile up work (429).
 */
export function supportRoutes(build: () => DiagnosticsArchive, report: ReportError = () => {}): Acryl {
  let busy = false
  const app = new Acryl()
  app.get(SUPPORT_DIAGNOSTICS_PATH, ownPage, (c) => {
    if (busy) return c.json(error('a diagnostics export is already running'), 429)
    busy = true
    try {
      const archive = build()
      // A copy into a plain ArrayBuffer, the body type a Response takes (a Buffer may sit on shared memory); the archive is size-capped.
      return c.body(new Uint8Array(archive.zip), 200, {
        'content-type': 'application/zip',
        'content-length': String(archive.zip.byteLength),
        'content-disposition': `attachment; filename="${safeFileName(archive.fileName)}"`,
      })
    } catch (cause) {
      report('build diagnostics archive', cause)
      return c.json(error('the diagnostics archive could not be created'), 500)
    } finally {
      busy = false
    }
  })
  return privateApi(SUPPORT_API_PREFIX, app)
}
