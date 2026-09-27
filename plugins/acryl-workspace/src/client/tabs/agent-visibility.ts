/**
 * Which tab types the "+" menu lists. Every type is listed by default; the user hides the ones they never use
 * from "Configure tabs" (an entry like `surface:diff`). Agents are not here: which agents are listed is set
 * in Settings > Agents. The choice is remembered in the browser storage (a per-viewer convenience).
 */

export const HIDDEN_AGENTS_KEY = 'acryl-workspace:hidden-agents'

/** @returns the ids the user hid; anything unreadable counts as "nothing hidden". */
export function readHiddenAgents(storage: Pick<Storage, 'getItem'> | undefined): ReadonlySet<string> {
  try {
    const raw = storage?.getItem(HIDDEN_AGENTS_KEY)
    if (raw === null || raw === undefined) return new Set()
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? new Set(parsed.filter((id): id is string => typeof id === 'string')) : new Set()
  } catch {
    return new Set()
  }
}

export function writeHiddenAgents(storage: Pick<Storage, 'setItem'> | undefined, hidden: ReadonlySet<string>): void {
  try {
    storage?.setItem(HIDDEN_AGENTS_KEY, JSON.stringify([...hidden].sort()))
  } catch {
    // Storage is a convenience; a blocked write just means the choice is not remembered.
  }
}

/** @returns a new set with the agent shown or hidden. */
export function toggleAgent(hidden: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(hidden)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}
