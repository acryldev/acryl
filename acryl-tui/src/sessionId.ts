/**
 * Session id prefix helpers shared between id generation/resolution
 * (`src/index.ts`) and display (`src/tui/StatusBar.tsx`). `session-` is the
 * de facto convention for top-level interactive sessions across the harness
 * (web portal, headless bundle), so ids keep the prefix on disk; only
 * user-facing text strips it.
 * @module @tomowang/dsh-tui/sessionId
 */

const SESSION_ID_PREFIX = 'session-'

/** Strip the `session-` prefix for display, if present. */
export function stripSessionIdPrefix(id: string): string {
  return id.startsWith(SESSION_ID_PREFIX) ? id.slice(SESSION_ID_PREFIX.length) : id
}

/** Add the `session-` prefix back, if missing, so a stripped id can round-trip through `--resume`. */
export function ensureSessionIdPrefix(id: string): string {
  return id.startsWith(SESSION_ID_PREFIX) ? id : `${SESSION_ID_PREFIX}${id}`
}
