/** Harness-native agent provider (full capability profile, native fidelity). */

import type { AgentTransport } from '../agent-control.ts'
import { createProviderPlugin } from './factory.ts'

export function dshNativeProvider(transport?: AgentTransport) {
  return createProviderPlugin({ kind: 'dsh-native', ...(transport === undefined ? {} : { transport }) })
}
