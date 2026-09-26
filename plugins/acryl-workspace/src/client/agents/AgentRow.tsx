/** One agent in Settings > Agents: on/off, default, install page, and its launch command and arguments. */

import { useState } from 'react'
import type { AgentSettingsEntry } from '../../agents/contract.ts'
import type { PreferencesPatch } from '../../agents/preferences.ts'
import { joinArguments, splitArguments } from '../../agents/argument-text.ts'
import { AgentIcon } from '../tabs/AgentIcon.tsx'
import { ExternalLinkIcon, Segmented } from './controls.tsx'

export interface AgentRowProps {
  readonly entry: AgentSettingsEntry
  readonly isDefault: boolean
  /** @throws an Error whose message says what to fix. */
  onChange(patch: PreferencesPatch): Promise<void>
  onRemove(id: string): Promise<void>
}

export function AgentRow({ entry, isDefault, onChange, onRemove }: AgentRowProps) {
  const [open, setOpen] = useState(false)
  const [command, setCommand] = useState(entry.command === entry.defaultCommand ? '' : entry.command)
  const [args, setArgs] = useState(joinArguments(entry.kind === 'known' ? entry.args : []))
  const [error, setError] = useState<string | null>(null)
  const known = entry.kind === 'known'
  const run = (work: Promise<void>): void => {
    work.then(() => { setError(null) }, (cause: unknown) => { setError(cause instanceof Error ? cause.message : 'could not save') })
  }
  const saveLaunch = (): void => {
    let parsed: string[]
    try {
      parsed = splitArguments(args)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'invalid arguments')
      return
    }
    run(onChange({ agent: { id: entry.id, command: command.trim() === '' ? null : command.trim(), args: parsed } }))
  }

  return (
    <li className="dshAgentsRow" data-agent-row={entry.id} data-disabled={!entry.enabled || undefined}>
      <div className="dshAgentsRowMain">
        <AgentIcon commandId={entry.id} custom={entry.badge ?? undefined} />
        <div className="dshAgentsRowName">
          <span className="dshAgentsRowLabel">{entry.label}{!entry.installed && <span className="dshAgentsBadge" title={`"${entry.command}" was not found on this machine`}>not found</span>}</span>
          <code className="dshAgentsRowCommand">{entry.preview}</code>
        </div>
        <Segmented
          label={`${entry.label} in the + menu`}
          value={entry.enabled ? 'on' : 'off'}
          options={[{ id: 'on', label: 'Enabled' }, { id: 'off', label: 'Disabled' }]}
          onChange={(id) => { run(onChange({ agent: { id: entry.id, enabled: id === 'on' } })) }}
        />
        {isDefault
          ? <span className="dshAgentsDefault" aria-label={`${entry.label} is the default`}>✓ Default</span>
          : <button type="button" className="dshAgentsButton" disabled={!entry.installed || !entry.enabled} onClick={() => { run(onChange({ defaultAgent: entry.id })) }}>Set default</button>}
        {entry.homepageUrl !== null && (
          <a className="dshAgentsIconLink" href={entry.homepageUrl} target="_blank" rel="noopener noreferrer" aria-label={`${entry.label} install and docs page`} title="Install and docs page"><ExternalLinkIcon /></a>
        )}
        <button type="button" className="dshAgentsChevron" aria-expanded={open} aria-label={`${entry.label} launch settings`} onClick={() => { setOpen(!open) }}>{open ? '▴' : '▾'}</button>
      </div>
      {open && (
        <div className="dshAgentsRowDetail">
          {known ? (
            <>
              <label>Command<input value={command} placeholder={entry.defaultCommand} spellCheck={false} onChange={(event) => { setCommand(event.target.value) }} onBlur={saveLaunch} onKeyDown={(event) => { if (event.key === 'Enter') saveLaunch() }} /></label>
              <label>Extra arguments<input value={args} placeholder="--flag value" spellCheck={false} onChange={(event) => { setArgs(event.target.value) }} onBlur={saveLaunch} onKeyDown={(event) => { if (event.key === 'Enter') saveLaunch() }} /></label>
              <p className="dshAgentsHint">
                Permission flags come from the mode above{entry.permissionArgs.length + Object.keys(entry.permissionEnv).length === 0 ? ' (this agent has none to add)' : ''}. Replace the command to run a different binary or a full path. Extra arguments are added after the permission flags.
              </p>
            </>
          ) : (
            <>
              <p className="dshAgentsHint">Your own agent. It runs exactly <code>{entry.preview}</code>. To change it, remove it and add it again.</p>
              <button type="button" className="dshAgentsButton" data-danger onClick={() => { run(onRemove(entry.id)) }}>Remove agent</button>
            </>
          )}
          {error !== null && <div className="dshAgentsError" role="alert">{error}</div>}
        </div>
      )}
      {!open && error !== null && <div className="dshAgentsError" role="alert">{error}</div>}
    </li>
  )
}
