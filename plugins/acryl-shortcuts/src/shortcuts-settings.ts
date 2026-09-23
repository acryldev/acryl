/** Durable shortcuts section: id -> user-assigned combo override. Shared by the Host schema and the browser scope. */

import z from '@deepseek-ai/schemastery'

export { SHORTCUTS_SETTINGS_NAMESPACE } from './shortcuts-namespace.ts'

/** Durable shortcuts schema: an open dictionary keyed by action id, each value a canonical combo string. */
export const ShortcutsSettingsSchema: z<Record<string, string>> = z.dict(z.string()).default({})
