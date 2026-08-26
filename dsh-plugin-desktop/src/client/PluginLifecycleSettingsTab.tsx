import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  PluginLifecycleApi,
  PluginLifecycleClientEntryView,
  PluginLifecycleClientSnapshot,
} from './plugin-lifecycle-api.ts'
import type { PluginLifecycleLocaleKey } from './plugin-lifecycle-locales.ts'
import { pluginLifecycleClasses as css } from './plugin-lifecycle-style-classes.ts'

export interface PluginLifecycleSettingsTabInjected {
  readonly api: PluginLifecycleApi
}

export type PluginLifecycleSettingsTabProps =
  PropsRuntime<'settings.plugins.tab'>
  & PropsLocale<'desktop.pluginLifecycle'>
  & InjectFace<PluginLifecycleSettingsTabInjected>

type ViewState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly snapshot: PluginLifecycleClientSnapshot }

type PendingAction = {
  readonly entryId: string
  readonly action: 'enable' | 'disable' | 'reload'
} | null

const PHASE_KEYS = {
  pending: 'pending',
  loading: 'loadingPhase',
  active: 'active',
  failed: 'failed',
  unloading: 'unloading',
} satisfies Record<Exclude<PluginLifecycleClientEntryView['hostPhase'], null>, PluginLifecycleLocaleKey>

function phaseLabel(
  phase: PluginLifecycleClientEntryView['hostPhase'],
  t: PluginLifecycleSettingsTabProps['t'],
): string {
  return phase === null ? t('notMounted') : t(PHASE_KEYS[phase])
}

function moduleShortName(moduleName: string): string {
  const unscoped = moduleName.startsWith('@') ? moduleName.slice(moduleName.indexOf('/') + 1) : moduleName
  return unscoped
    .replace(/^cordis:/, '')
    .replace(/^cordis-plugin-/, '')
    .replace(/^dsh-(?:host-|client-|plugin-)?/, '')
}

function matches(entry: PluginLifecycleClientEntryView, query: string): boolean {
  if (query.length === 0) return true
  return [entry.moduleName, entry.entryId, entry.clientPackage ?? '']
    .some(value => value.toLocaleLowerCase().includes(query))
}

function clientLabel(
  entry: PluginLifecycleClientEntryView,
  t: PluginLifecycleSettingsTabProps['t'],
): string {
  if (entry.clientPackage === null) return t('notApplicable')
  return entry.clientMounted ? phaseLabel(entry.clientPhase, t) : t('notMounted')
}

export function PluginLifecycleSettingsTab({ api, t }: PluginLifecycleSettingsTabProps): ReactNode {
  const catalogId = useId()
  const [request, setRequest] = useState(0)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingAction>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [state, setState] = useState<ViewState>({ status: 'loading' })

  useEffect(() => {
    let current = true
    void api.read().then(
      snapshot => { if (current) setState({ status: 'ready', snapshot }) },
      cause => {
        if (current) setState({
          status: 'error',
          message: cause instanceof Error ? cause.message : String(cause),
        })
      },
    )
    return () => { current = false }
  }, [api, request])

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filtered = useMemo(
    () => state.status === 'ready'
      ? state.snapshot.entries.filter(entry => matches(entry, normalizedQuery))
      : [],
    [normalizedQuery, state],
  )

  const retry = (): void => {
    setState({ status: 'loading' })
    setRequest(value => value + 1)
  }

  const execute = async (action: NonNullable<PendingAction>['action'], entryId?: string): Promise<void> => {
    setBusy(true)
    setActionError(null)
    try {
      if (action === 'enable' && entryId !== undefined) await api.enable(entryId)
      else if (action === 'disable' && entryId !== undefined) await api.disable(entryId)
      else await api.reload(entryId)
    } catch (cause) {
      setBusy(false)
      setPending(null)
      setActionError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <div className={css.section} aria-busy={state.status === 'loading' || busy}>
      <div className={css.toolbar}>
        <p>{t('shortcut')}</p>
        <button type="button" disabled={busy} onClick={() => { void execute('reload') }}>
          {t('reloadAll')}
        </button>
      </div>
      {actionError !== null ? <p className={css.failure} role="alert">{actionError}</p> : null}
      {state.status === 'loading' ? <p className={css.status}>{t('loading')}</p> : null}
      {state.status === 'error' ? (
        <div className={css.failure}>
          <p role="alert">{t('error')} {state.message}</p>
          <button type="button" onClick={retry}>{t('retry')}</button>
        </div>
      ) : null}
      {state.status === 'ready' ? (
        <div className={css.catalog}>
          <label className={css.search}>
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={query}
              placeholder={t('search')}
              aria-label={t('search')}
              onChange={(event) => { setQuery(event.currentTarget.value) }}
            />
          </label>
          <div className={css.catalogHeading}>
            <h3>{t('catalog')}</h3>
            <span>{filtered.length}</span>
          </div>
          {filtered.length === 0 ? <p className={css.status}>{t('empty')}</p> : null}
          <ul className={css.cards}>
            {filtered.map((entry) => {
              const title = moduleShortName(entry.moduleName)
              const open = expanded === entry.entryId
              const detailId = `${catalogId}-${encodeURIComponent(entry.entryId)}`
              const confirmingDisable = pending?.entryId === entry.entryId && pending.action === 'disable'
              return (
                <li className={css.card} key={entry.entryId} data-plugin-entry={entry.entryId}>
                  <button
                    className={css.cardHeader}
                    type="button"
                    aria-expanded={open}
                    aria-controls={detailId}
                    onClick={() => { setExpanded(current => current === entry.entryId ? null : entry.entryId) }}
                  >
                    <strong title={entry.moduleName}>{title}</strong>
                    <span className={css.summary}>
                      <span data-mounted={entry.hostPhase === 'active'}>{t('host')}: {phaseLabel(entry.hostPhase, t)}</span>
                      <span data-mounted={entry.clientMounted}>{t('client')}: {clientLabel(entry, t)}</span>
                      <span className={css.chevron} aria-hidden="true">⌄</span>
                    </span>
                  </button>
                  {open ? (
                    <div className={css.details} id={detailId}>
                      <code>{entry.entryId}</code>
                      <dl>
                        <div><dt>{t('configuration')}</dt><dd>{t(entry.enabled ? 'enabled' : 'disabled')}</dd></div>
                        <div><dt>{t('host')}</dt><dd>{phaseLabel(entry.hostPhase, t)}</dd></div>
                        <div><dt>{t('client')}</dt><dd>{clientLabel(entry, t)}</dd></div>
                      </dl>
                      {entry.mutable ? (
                        <div className={css.actions}>
                          {entry.enabled ? (
                            <>
                              {confirmingDisable ? (
                                <>
                                  <button type="button" className={css.danger} disabled={busy} onClick={() => { void execute('disable', entry.entryId) }}>
                                    {t('confirmDisable')}
                                  </button>
                                  <button type="button" disabled={busy} onClick={() => { setPending(null) }}>{t('cancel')}</button>
                                </>
                              ) : (
                                <button type="button" disabled={busy} onClick={() => { setPending({ entryId: entry.entryId, action: 'disable' }) }}>
                                  {t('disable')}
                                </button>
                              )}
                              <button type="button" disabled={busy || confirmingDisable} onClick={() => { void execute('reload', entry.entryId) }}>
                                {t('reload')}
                              </button>
                            </>
                          ) : (
                            <button type="button" disabled={busy} onClick={() => { void execute('enable', entry.entryId) }}>
                              {t('enable')}
                            </button>
                          )}
                        </div>
                      ) : (
                        <p className={css.protected}><strong>{t('protected')}:</strong> {entry.protectedReason}</p>
                      )}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
