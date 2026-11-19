/** Codex CLI provider (structured fidelity). */

import type { AgentTransport } from '../agent-control.ts'
import { createProviderPlugin } from './factory.ts'

export function codexProvider(transport?: AgentTransport) {
  return createProviderPlugin({ kind: 'codex', ...(transport === undefined ? {} : { transport }) })
}
