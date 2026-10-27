/** Strict private loopback route for the native Host Cordis architecture snapshot. */

import { Acryl } from 'acrylblends'
import { error } from 'acryl-loopback-http'
import { ownPage, privateApi, type ReportError } from 'acryl-loopback-http/router'
import type { CordisPlaneSnapshot } from './contract.ts'
import { PLUGIN_ARCHITECTURE_PATH } from './contract.ts'

export interface PluginArchitectureRouteController {
  snapshot(): CordisPlaneSnapshot
}

/**
 * The architecture snapshot as one app, under the shared private-route rules: a read only from the app's own page, 405 with `Allow`
 * for another method, and a projection failure reported and answered 500 without its cause.
 */
export function architectureRoutes(controller: PluginArchitectureRouteController, report: ReportError = () => {}): Acryl {
  const app = new Acryl()
  app.get(PLUGIN_ARCHITECTURE_PATH, ownPage, (c) => {
    try {
      return c.json(controller.snapshot())
    } catch (cause) {
      report('read Cordis architecture', cause)
      return c.json(error('Cordis architecture unavailable'), 500)
    }
  })
  return privateApi(PLUGIN_ARCHITECTURE_PATH, app)
}
