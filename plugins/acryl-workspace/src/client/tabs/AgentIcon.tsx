/**
 * The badge that tells agents apart. Agents with a drawn mark show it (`agent-marks.tsx`); the other known agents and custom
 * agents show the letter and colour its author chose.
 */

import { knownAgent } from '../../agents/known-agents.ts'
import { isWorkspacePtyCommandId } from '../../pty/contract.ts'
import { AGENT_MARKS } from './agent-marks.tsx'

/** @param custom - the badge of a custom agent; built-in agents use their own mark. */
export function AgentIcon({ commandId, custom }: { readonly commandId: string; readonly custom?: { readonly letter: string; readonly color: string } | undefined }) {
  const mark = custom === undefined && isWorkspacePtyCommandId(commandId) ? AGENT_MARKS[commandId] : undefined
  if (mark !== undefined) {
    return (
      <span className="dshWorkspaceAgentMark" aria-hidden="true" data-agent={commandId}>
        <svg viewBox="0 0 24 24" width="100%" height="100%">{mark}</svg>
      </span>
    )
  }
  const badge = custom ?? knownAgent(commandId)?.badge ?? { letter: '?', color: '#94a3b8' }
  return (
    <span className="dshWorkspaceAgentIcon" style={{ color: badge.color, borderColor: badge.color }} aria-hidden="true" data-agent={commandId}>
      {badge.letter}
    </span>
  )
}
