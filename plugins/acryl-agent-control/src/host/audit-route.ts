/** Same-origin route for reading the recent audit entries (the Settings viewer). */

import { Acryl } from 'acryl-router'
import type { AuditLog } from './audit.ts'
import { ownPage } from './http.ts'

export const UI_CONTROL_AUDIT_PATH = '/api/acryl-agent-control/audit'

/** GET the most recent entries, newest last. Read-only: the log can only be appended to by the tools. */
export function auditRoutes(audit: AuditLog): Acryl {
  return new Acryl().get(UI_CONTROL_AUDIT_PATH, ownPage, c => c.json({ entries: audit.recent(100) }))
}
