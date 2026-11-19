/** Claude provider (structured fidelity). */

import type { AgentTransport } from '../agent-control.ts'
import { createProviderPlugin } from './factory.ts'

export function claudeProvider(transport?: AgentTransport) {
  return createProviderPlugin({ kind: 'claude', ...(transport === undefined ? {} : { transport }) })
}
