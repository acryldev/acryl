/** Settings > Agents, registered through the shared section plugin. */

import { settingsSectionPlugin } from '../settings/section-plugin.ts'
import { AgentsSection } from './AgentsSection.tsx'
import type { AgentsState } from './agents-state.ts'

/** @param agents - the shared agents state the section reads and changes. */
export function agentsSettingsPlugin(agents: AgentsState) {
  return settingsSectionPlugin('acryl-workspace-agents-settings', 'agents', 40, (ctx, base) => ctx.slots.register({ ...base, inject: () => ({ agents }) }, AgentsSection))
}
