/**
 * The door's host core for another Host to build its own door on (`acryl-door/host`): the page channel and its routes, and the audit log.
 * ACRYL's DSH Host uses it in `acryl-agent-control`, with its own tools, approval and secret.
 */

export { UiChannel, type PageStream } from './channel.ts'
export { AuditLog, auditPath, type AuditEntry } from './audit.ts'
export { HEARTBEAT_MS, pageChannelRoutes, type PageRoutesOptions } from './page-routes.ts'
export { renderSnapshot } from '../page/snapshot-text.ts'
