/** ACP protocol provider (structured fidelity). */

import type { AgentTransport } from '../agent-control.ts'
import { createProviderPlugin } from './factory.ts'

export function acpProvider(transport?: AgentTransport) {
  return createProviderPlugin({ kind: 'acp', ...(transport === undefined ? {} : { transport }) })
}
