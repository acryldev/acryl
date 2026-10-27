/** What the running composition offers, for the app's own page only. */

import { Acryl } from 'acrylblends'
import { ownPage } from '../private-route.ts'
import { WORKSPACE_CAPABILITIES_PATH, type WorkspaceCapabilities } from './contract.ts'

/**
 * GET the capabilities. `read` is asked on every request, so a chat that was switched on or off in the Loader since the page loaded is
 * reported as it is now: the truth is the composition, not a flag copied from a Blueprint.
 */
export function capabilityRoutes(read: () => WorkspaceCapabilities): Acryl {
  return new Acryl().get(WORKSPACE_CAPABILITIES_PATH, ownPage, c => c.json(read()))
}
