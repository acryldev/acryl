/**
 * @module
 * Cloudflare Pages Adapter for Acryl.
 *
 * @deprecated
 * Cloudflare recommends Workers with static assets; use `acryl` on Workers instead.
 */

export { handle, handleMiddleware, serveStatic } from './handler.ts'
export { getConnInfo } from './conninfo.ts'
export type { EventContext } from './handler.ts'
