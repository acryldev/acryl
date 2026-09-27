/** Settings > Agent Control: what the agent did in this window. */

import { useEffect, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { AuditEntry } from '../contract.ts'
import type { AuditApi } from './audit-api.ts'

export interface AuditSectionInjected {
  readonly api: AuditApi
}

export type AuditSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'acryl.agentControl'>
  & InjectFace<AuditSectionInjected>

type State =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly entries: readonly AuditEntry[] }

const time = (iso: string): string => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleString() }
const action = (tool: string): string => tool.replace(/^ui_/, '')

export function AuditSection({ api, t }: AuditSectionProps) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let current = true
    setState({ status: 'loading' })
    api.recent().then(
      (entries) => { if (current) setState({ status: 'ready', entries }) },
      (cause: unknown) => { if (current) setState({ status: 'error', message: cause instanceof Error ? cause.message : 'The activity list could not be loaded.' }) },
    )
    return () => { current = false }
  }, [api, reload])
  return (
    <section className="dshAgentControlSection" aria-label={t('heading')}>
      <h3 className="dshAgentControlHeading">{t('heading')}</h3>
      <p className="dshAgentControlText">{t('description')}</p>
      <button type="button" className="dshAgentControlButton" onClick={() => { setReload(n => n + 1) }}>{t('refresh')}</button>
      {state.status === 'loading' && <p className="dshAgentControlText">{t('loading')}</p>}
      {state.status === 'error' && <p className="dshAgentControlText" role="alert" data-error>{state.message}</p>}
      {state.status === 'ready' && state.entries.length === 0 && <p className="dshAgentControlText">{t('empty')}</p>}
      {state.status === 'ready' && state.entries.length > 0 && (
        <table className="dshAgentControlTable">
          <thead><tr><th>{t('time')}</th><th>{t('tool')}</th><th>{t('control')}</th><th>{t('result')}</th></tr></thead>
          <tbody>
            {[...state.entries].reverse().map((entry, index) => (
              <tr key={`${entry.at}-${String(index)}`} data-outcome={entry.outcome}>
                <td>{time(entry.at)}</td>
                <td>{action(entry.tool)}</td>
                <td>{entry.target === undefined ? '' : `${entry.target.role} "${entry.target.name}"`}</td>
                <td>{entry.outcome}{entry.detail === undefined ? '' : ` (${entry.detail})`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
