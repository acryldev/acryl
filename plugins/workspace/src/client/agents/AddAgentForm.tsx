/**
 * The form for adding your own agent: a name, a command, arguments and a badge, with the exact command line
 * shown before anything is saved. Lives in Settings > Agents, where there is room for it.
 */

import { useState } from 'react'
import { BADGE_COLORS, type CustomAgent } from '../../agents/definition.ts'
import { draftToAgent, EMPTY_DRAFT, previewCommand, type AgentDraft } from './agent-draft.ts'

export interface AddAgentFormProps {
  /** @throws an Error whose message says what to fix (the Host's own refusal text). */
  onAdd(agent: CustomAgent): Promise<void>
}

export function AddAgentForm({ onAdd }: AddAgentFormProps) {
  const [draft, setDraft] = useState<AgentDraft>(EMPTY_DRAFT)
  const [error, setError] = useState<string | null>(null)
  const built = draftToAgent(draft)

  return (
    <form
      className="dshAgentsAddForm"
      aria-label="Add your own agent"
      onSubmit={(event) => {
        event.preventDefault()
        if (!built.ok) { setError(built.message); return }
        onAdd(built.agent).then(
          () => { setDraft(EMPTY_DRAFT); setError(null) },
          (cause: unknown) => { setError(cause instanceof Error ? cause.message : 'could not save') },
        )
      }}
    >
      <label>Name<input value={draft.name} onChange={(event) => { setDraft({ ...draft, name: event.target.value }) }} placeholder="My Agent" /></label>
      <label>Command<input value={draft.command} onChange={(event) => { setDraft({ ...draft, command: event.target.value }) }} placeholder="my-agent or /path/to/my-agent" spellCheck={false} /></label>
      <label>Arguments (one per line)<textarea rows={3} value={draft.args} onChange={(event) => { setDraft({ ...draft, args: event.target.value }) }} spellCheck={false} /></label>
      <div className="dshAgentsBadgeRow">
        <label>Badge<input className="dshAgentsLetter" maxLength={2} value={draft.letter} onChange={(event) => { setDraft({ ...draft, letter: [...event.target.value].slice(0, 1).join('') }) }} placeholder={([...draft.name.trim()][0] ?? 'A').toUpperCase()} /></label>
        <div className="dshAgentsColors" role="radiogroup" aria-label="Badge colour">
          {BADGE_COLORS.map(color => (
            <button key={color} type="button" role="radio" aria-checked={draft.color === color} aria-label={color} className="dshAgentsColor" style={{ background: color }} onClick={() => { setDraft({ ...draft, color }) }} />
          ))}
        </div>
      </div>
      <div className="dshAgentsPreview" aria-live="polite">
        {built.ok ? <>Runs: <code>{previewCommand(built.agent)}</code></> : <span data-muted>{draft.name === '' && draft.command === '' ? 'Fill in a name and a command.' : built.message}</span>}
      </div>
      {error !== null && <div className="dshAgentsError" role="alert">{error}</div>}
      <div className="dshAgentsFormActions">
        <button type="submit" className="dshAgentsButton" data-primary disabled={!built.ok}>Add agent</button>
      </div>
    </form>
  )
}
