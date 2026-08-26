import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import type {
  CordisDependencyView,
  CordisEffectView,
  CordisFiberView,
  CordisPlaneSnapshot,
  PluginArchitectureSnapshot,
} from '../plugin-architecture-contract.ts'
import type { PluginArchitectureApi } from './plugin-architecture-api.ts'
import type { PluginLifecycleLocaleKey } from './plugin-lifecycle-locales.ts'
import { pluginLifecycleClasses as css } from './plugin-lifecycle-style-classes.ts'

export interface PluginArchitectureSettingsTabInjected {
  readonly api: PluginArchitectureApi
}

export type PluginArchitectureSettingsTabProps = PluginArchitectureSettingsTabInjected & {
  readonly t: (key: PluginLifecycleLocaleKey) => string
}

type ViewState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly snapshot: PluginArchitectureSnapshot }

function phaseLabel(phase: CordisFiberView['phase'], t: PluginArchitectureSettingsTabProps['t']): string {
  if (phase === 'loading') return t('loadingPhase')
  if (phase === 'active') return t('active')
  if (phase === 'unloading') return t('unloading')
  return t(phase)
}

function dependencyLabel(
  dependency: CordisDependencyView,
  t: PluginArchitectureSettingsTabProps['t'],
): string {
  if (dependency.status === 'resolved') {
    return `${dependency.name} · ${t('resolvedBy')} #${String(dependency.providerFiberUid)}`
  }
  return `${dependency.name} · ${t(dependency.status)}`
}

function effectTree(effects: readonly CordisEffectView[]): ReactNode {
  if (effects.length === 0) return null
  return (
    <ul className={css.effectTree}>
      {effects.map((effect, index) => (
        <li key={`${effect.label}-${String(index)}`}>
          <code>{effect.label}</code>
          {effectTree(effect.children)}
        </li>
      ))}
    </ul>
  )
}

function matches(fiber: CordisFiberView, query: string): boolean {
  if (query === '') return true
  return [
    fiber.name,
    fiber.loaderEntryId ?? '',
    fiber.moduleName ?? '',
    ...fiber.dependencies.map(dependency => dependency.name),
    ...fiber.providedServices,
  ].some(value => value.toLocaleLowerCase().includes(query))
}

function FiberCard({ fiber, t }: {
  readonly fiber: CordisFiberView
  readonly t: PluginArchitectureSettingsTabProps['t']
}): ReactNode {
  return (
    <li className={css.fiber} data-fiber-uid={fiber.uid}>
      <details>
        <summary className={css.fiberHeader}>
          <span>
            <strong>{fiber.name}</strong>
            <small>Fiber #{fiber.uid}</small>
          </span>
          <span className={css.phase} data-phase={fiber.phase}>{phaseLabel(fiber.phase, t)}</span>
        </summary>
        <div className={css.nativeDetails}>
          <dl className={css.fiberMeta}>
            <div><dt>{t('parentFiber')}</dt><dd>{fiber.parentUid === null ? t('rootFiber') : `#${String(fiber.parentUid)}`}</dd></div>
            <div><dt>{t('loaderEntry')}</dt><dd><code>{fiber.loaderEntryId ?? t('none')}</code></dd></div>
            <div><dt>{t('module')}</dt><dd><code>{fiber.moduleName ?? t('none')}</code></dd></div>
          </dl>
          <section>
            <h4>{t('dependencies')}</h4>
            {fiber.dependencies.length === 0 ? <p>{t('none')}</p> : (
              <div className={css.chips}>
                {fiber.dependencies.map(dependency => (
                  <span className={css.chip} data-status={dependency.status} key={dependency.name}>
                    {dependencyLabel(dependency, t)}
                  </span>
                ))}
              </div>
            )}
          </section>
          <section>
            <h4>{t('provides')}</h4>
            {fiber.providedServices.length === 0 ? <p>{t('none')}</p> : (
              <div className={css.chips}>
                {fiber.providedServices.map(service => <code className={css.chip} key={service}>{service}</code>)}
              </div>
            )}
          </section>
          <section>
            <h4>{t('effects')}</h4>
            {fiber.effects.length === 0 ? <p>{t('none')}</p> : effectTree(fiber.effects)}
          </section>
        </div>
      </details>
    </li>
  )
}

function Plane({ snapshot, query, t }: {
  readonly snapshot: CordisPlaneSnapshot
  readonly query: string
  readonly t: PluginArchitectureSettingsTabProps['t']
}): ReactNode {
  const filtered = snapshot.fibers.filter(fiber => matches(fiber, query))
  const active = snapshot.fibers.filter(fiber => fiber.phase === 'active').length
  return (
    <section className={css.plane} data-cordis-plane={snapshot.plane}>
      <header className={css.planeHeader}>
        <div><h3>{snapshot.plane === 'host' ? t('host') : t('client')}</h3><p>Cordis Context</p></div>
        <div className={css.stats}>
          <span>{t('fibers')}: <strong>{snapshot.fibers.length}</strong></span>
          <span>{t('active')}: <strong>{active}</strong></span>
          <span>{t('services')}: <strong>{snapshot.services.length}</strong></span>
        </div>
      </header>
      {filtered.length === 0 ? <p className={css.status}>{t('empty')}</p> : (
        <ul className={css.fiberList}>
          {filtered.map(fiber => <FiberCard fiber={fiber} key={fiber.uid} t={t} />)}
        </ul>
      )}
    </section>
  )
}

/** Read-only explorer over the two actual Cordis contexts. */
export function PluginArchitectureSettingsTab({ api, t }: PluginArchitectureSettingsTabProps): ReactNode {
  const [request, setRequest] = useState(0)
  const [query, setQuery] = useState('')
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
  const normalizedQuery = useMemo(() => query.trim().toLocaleLowerCase(), [query])
  return (
    <div className={css.section} aria-busy={state.status === 'loading'}>
      <p className={css.architectureSummary}>{t('architectureIntro')}</p>
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
      {state.status === 'loading' ? <p className={css.status}>{t('loading')}</p> : null}
      {state.status === 'error' ? (
        <div className={css.failure}>
          <p role="alert">{t('error')} {state.message}</p>
          <button type="button" onClick={() => { setState({ status: 'loading' }); setRequest(value => value + 1) }}>
            {t('retry')}
          </button>
        </div>
      ) : null}
      {state.status === 'ready' ? (
        <>
          <Plane snapshot={state.snapshot.host} query={normalizedQuery} t={t} />
          <Plane snapshot={state.snapshot.client} query={normalizedQuery} t={t} />
        </>
      ) : null}
    </div>
  )
}
