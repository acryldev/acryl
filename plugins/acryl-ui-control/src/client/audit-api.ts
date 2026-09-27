/** Same-origin client for the audit entries. */

import type { AuditEntry } from '../contract.ts'

export const AUDIT_PATH = '/api/acryl-ui-control/audit'

export interface AuditApi {
  /** @throws an Error whose message is fit to show the user. */
  recent(): Promise<readonly AuditEntry[]>
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

const isEntry = (value: unknown): value is AuditEntry => typeof value === 'object' && value !== null
  && typeof (value as AuditEntry).at === 'string' && typeof (value as AuditEntry).tool === 'string'
  && ['ok', 'refused', 'failed'].includes((value as AuditEntry).outcome)

export function createAuditApi(fetchImpl: FetchLike = (input, init) => fetch(input, init)): AuditApi {
  return {
    async recent() {
      const response = await fetchImpl(AUDIT_PATH, { method: 'GET', credentials: 'same-origin' })
      if (response.status !== 200) throw new Error(`The activity list could not be loaded (HTTP ${String(response.status)}).`)
      const body: unknown = await response.json()
      if (typeof body !== 'object' || body === null || !('entries' in body) || !Array.isArray(body.entries)) throw new Error('The activity list was not understood.')
      return body.entries.filter(isEntry)
    },
  }
}
