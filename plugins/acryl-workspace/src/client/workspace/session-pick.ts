/** Decide which existing chat to show for a worktree. */

import { owningWorktree } from './sidebar-model.ts'
import type { RepoState } from './shell-state.ts'

/** The slice of a session row the choice needs. */
export interface SessionRef {
  readonly id: string
  readonly cwd?: string
  readonly blank: boolean
  readonly updatedAt: number
}

/**
 * The chat to open when the user picks a worktree: its most recently updated chat that has
 * messages, else its most recently updated empty one (reusing it beats piling up empty chats).
 * @returns the session id, or undefined when the worktree has no chat yet.
 */
export function pickSession(
  repos: readonly RepoState[],
  sessions: readonly SessionRef[],
  worktreePath: string,
): string | undefined {
  let best: SessionRef | undefined
  for (const session of sessions) {
    if (session.cwd === undefined || owningWorktree(repos, session.cwd) !== worktreePath) continue
    if (best === undefined
      || (best.blank && !session.blank)
      || (best.blank === session.blank && session.updatedAt > best.updatedAt)) {
      best = session
    }
  }
  return best?.id
}
