/** Settings > Support: export a diagnostics archive. */

import { useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SupportApi } from './support-api.ts'
import { saveDownload } from './support-api.ts'

export interface SupportSectionInjected {
  readonly api: SupportApi
}

export type SupportSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'acryl.support'>
  & InjectFace<SupportSectionInjected>

type State =
  | { readonly status: 'idle' }
  | { readonly status: 'working' }
  | { readonly status: 'done' }
  | { readonly status: 'error'; readonly message: string }

export function SupportSection({ api, t }: SupportSectionProps) {
  const [state, setState] = useState<State>({ status: 'idle' })
  const run = (): void => {
    setState({ status: 'working' })
    api.fetchDiagnostics().then(
      (download) => { saveDownload(download); setState({ status: 'done' }) },
      (cause: unknown) => { setState({ status: 'error', message: cause instanceof Error ? cause.message : 'The export failed.' }) },
    )
  }
  return (
    <section className="dshSupportSection" aria-label={t('heading')}>
      <h3 className="dshSupportHeading">{t('heading')}</h3>
      <p className="dshSupportText">{t('description')}</p>
      <div className="dshSupportActions">
        <button type="button" className="dshSupportButton" disabled={state.status === 'working'} onClick={run}>
          {state.status === 'working' ? t('exporting') : t('export')}
        </button>
        {state.status === 'done' && <span className="dshSupportNote" role="status">{t('done')}</span>}
        {state.status === 'error' && <span className="dshSupportNote" data-error role="alert">{state.message}</span>}
      </div>
      <p className="dshSupportFine">{t('privacy')}</p>
    </section>
  )
}
