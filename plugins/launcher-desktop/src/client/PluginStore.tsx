/**
 * The plugin catalog (spec 053 E): the public Cordis plugin registry, browsed beside the Blends store with the same layout. A kind is what a plugin does for an app
 * (chips), a domain is the shared catalog's place for it (the tree), and a plugin's page adds it to one of the person's apps through the same pull the app's
 * own Plugins panel uses. The Host reads and names everything; this draws it.
 */
import { useEffect, useState, type ReactNode } from 'react'
import type { AppView, PluginCatalogEntry, PluginCatalogView } from '../contract.ts'
import type { LauncherApi } from './api.ts'
import { iconColor, initial } from './model.ts'
import { compatibilityNote, domainTree, filterPlugins, kindChips, unclassifiedCount, type KindFilter, type OriginFilter } from './plugin-catalog-model.ts'

const message = (cause: unknown): string => cause instanceof Error ? cause.message : String(cause)

export interface PluginStoreProps {
  readonly api: LauncherApi
  /** The person's apps (the list the screen polls), to add a plugin to. */
  readonly apps: readonly AppView[]
  readonly onStart: (id: string) => Promise<boolean>
  readonly openExternal: (url: string) => void
}

export function PluginStoreView({ api, apps, onStart, openExternal }: PluginStoreProps): ReactNode {
  const [catalog, setCatalog] = useState<PluginCatalogView | undefined>(undefined)
  const [failed, setFailed] = useState<string | undefined>(undefined)
  const [search, setSearch] = useState('')
  const [origin, setOrigin] = useState<OriginFilter>('all')
  const [kind, setKind] = useState<KindFilter>('all')
  const [category, setCategory] = useState<string | undefined>(undefined)
  const [sub, setSub] = useState<string | undefined>(undefined)
  const [viewing, setViewing] = useState<PluginCatalogEntry | undefined>(undefined)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let live = true
    setFailed(undefined)
    api.pluginCatalog().then((view) => { if (live) setCatalog(view) }, (cause: unknown) => { if (live) setFailed(message(cause)) })
    return () => { live = false }
  }, [api, attempt])

  if (viewing !== undefined && catalog !== undefined) return <PluginPage plugin={viewing} catalog={catalog} apps={apps} api={api} onStart={onStart} openExternal={openExternal} onBack={() => { setViewing(undefined) }} />

  const plugins = catalog?.plugins ?? []
  const base = { kind, origin, search }
  const tree = catalog === undefined ? [] : domainTree(filterPlugins(catalog, base))
  const current = tree.find(group => group.name === category)
  const shown = catalog === undefined ? [] : filterPlugins(catalog, { ...base, ...category === undefined ? {} : { category }, ...sub === undefined ? {} : { sub } })
  const count = (which: PluginCatalogEntry['origin']): number => plugins.filter(plugin => plugin.origin === which).length
  const choose = (name: string | undefined): void => { setCategory(name); setSub(undefined) }
  const chips = catalog === undefined ? [] : kindChips(catalog)
  const loose = catalog === undefined ? 0 : unclassifiedCount(catalog)
  return (
    <section className="acrylHomeForm">
      <h3 style={{ margin: 0 }}>Plugin catalog</h3>
      <p className="acrylHomeNote">Plugins from the public Cordis registry (cordisplugins.github.io). Open one to see what it does, then add it to one of your apps: the same as <span className="acrylHomeMeta">/plugin pull github:owner/repo@version</span> in the app.</p>
      <input className="acrylHomeSearch" type="search" value={search} placeholder="Search plugins..." aria-label="Search plugins" onChange={(event) => { setSearch(event.target.value) }} />
      <div className="acrylHomeRow" role="group" aria-label="Who released it">
        <button type="button" className="acrylHomeChip" aria-pressed={origin === 'all'} onClick={() => { setOrigin('all') }}>All ({plugins.length})</button>
        <button type="button" className="acrylHomeChip" aria-pressed={origin === 'official'} title="Released by the ACRYL project" onClick={() => { setOrigin('official') }}>Official ({count('official')})</button>
        <button type="button" className="acrylHomeChip" aria-pressed={origin === 'community'} title="Released by people outside the ACRYL project; their code is not reviewed" onClick={() => { setOrigin('community') }}>Community ({count('community')})</button>
      </div>
      <div className="acrylHomeRow" role="group" aria-label="Kind of plugin">
        <button type="button" className="acrylHomeChip" aria-pressed={kind === 'all'} onClick={() => { setKind('all') }}>Every kind</button>
        {chips.map(chip => <button key={chip.kind.slug} type="button" className="acrylHomeChip" aria-pressed={kind === chip.kind.slug} title={chip.kind.description} onClick={() => { setKind(chip.kind.slug) }}>{chip.kind.name} ({chip.count})</button>)}
        {loose === 0 ? null : <button type="button" className="acrylHomeChip" aria-pressed={kind === 'unclassified'} title="Its author has not said what kind it is" onClick={() => { setKind('unclassified') }}>Unclassified ({loose})</button>}
      </div>
      <div className="acrylHomeStore">
        {tree.length === 0 ? <div /> : (
          <div className="acrylHomeStoreCats" role="group" aria-label="Domains">
            <button type="button" className="acrylHomeNavItem" aria-pressed={category === undefined} aria-label={`All domains (${String(plugins.length)})`} onClick={() => { choose(undefined) }}><span>All domains</span></button>
            {tree.map(group => <button key={group.name} type="button" className="acrylHomeNavItem" aria-pressed={category === group.name} aria-label={`${group.name} (${String(group.count)})`} onClick={() => { choose(group.name) }}><span>{group.name}</span><span className="acrylHomeCount">{group.count}</span></button>)}
          </div>
        )}
        <div className="acrylHomeStoreMain">
          {current === undefined || current.subs.length === 0 ? null : (
            <div className="acrylHomeRow" role="group" aria-label={`Subcategories of ${current.name}`}>
              <button type="button" className="acrylHomeChip" aria-pressed={sub === undefined} onClick={() => { setSub(undefined) }}>All of {current.name}</button>
              {current.subs.map(entry => <button key={entry.id} type="button" className="acrylHomeChip" aria-pressed={sub === entry.id} onClick={() => { setSub(entry.id) }}>{entry.name} ({entry.count})</button>)}
            </div>
          )}
          {failed !== undefined ? <p className="acrylHomeNote" data-error role="alert">{failed} <button type="button" className="acrylHomeBtn" data-small onClick={() => { setAttempt(attempt + 1) }}>Try again</button></p> : null}
          {catalog === undefined && failed === undefined ? <p className="acrylHomeNote">Reading the registry...</p> : null}
          {catalog !== undefined ? <p className="acrylHomeNote" role="status">{shown.length === plugins.length ? `${String(plugins.length)} plugins` : `${String(shown.length)} of ${String(plugins.length)} plugins`}</p> : null}
          {catalog !== undefined && shown.length === 0 ? <p className="acrylHomeNote">No plugin matches.</p> : null}
          <div className="acrylHomeCards">
            {shown.map(plugin => (
              <div className="acrylHomeApp" key={plugin.id}>
                <button type="button" className="acrylHomeHead acrylHomeHeadLink" title={`Open ${plugin.name}: what it does and how to add it`} aria-label={`Open ${plugin.name}`} onClick={() => { setViewing(plugin) }}>
                  <div className="acrylHomeIcon" style={{ background: iconColor(plugin.id) }}>{initial(plugin.name)}</div>
                  <div style={{ minWidth: 0 }}><div className="acrylHomeName">{plugin.name}</div><div className="acrylHomeMeta">{plugin.version === '' ? plugin.id : `v${plugin.version}`}</div></div>
                </button>
                <p className="acrylHomeDesc">{plugin.description}</p>
                <PluginPills plugin={plugin} kinds={catalog?.kinds ?? []} />
                <div className="acrylHomeCardFoot" data-wrap="">
                  <button type="button" className="acrylHomeBtn" data-small data-primary onClick={() => { setViewing(plugin) }}>View</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/** Who released a plugin, what kind it is and where the shared catalog files it, as the card and the plugin's page show them. */
function PluginPills({ plugin, kinds }: { plugin: PluginCatalogEntry, kinds: PluginCatalogView['kinds'] }): ReactNode {
  const kind = kinds.find(entry => entry.slug === plugin.kind)
  return (
    <div className="acrylHomeRow">
      {plugin.origin === 'official'
        ? <span className="acrylHomePill" title="Released by the ACRYL project">Official</span>
        : <span className="acrylHomePill" title="Released by someone outside the ACRYL project; its code is not reviewed">Community</span>}
      {plugin.publisher === '' ? null : <span className="acrylHomeMeta">by @{plugin.publisher}</span>}
      {kind === undefined ? null : <span className="acrylHomePill" title={kind.description}>{kind.name}</span>}
      {plugin.domain === undefined ? null : <span className="acrylHomePill">{plugin.domain.category} › {plugin.domain.sub}</span>}
    </div>
  )
}

interface PluginPageProps extends PluginStoreProps {
  readonly plugin: PluginCatalogEntry
  readonly catalog: PluginCatalogView
  readonly onBack: () => void
}

/** A plugin's own page: what it is, who released it, how to pull it, and "Add to an app" for one of the person's apps (it must be running: the pull goes through its door). */
function PluginPage({ plugin, catalog, apps, api, onStart, openExternal, onBack }: PluginPageProps): ReactNode {
  const candidates = apps.filter(app => app.state !== 'missing')
  const [chosen, setChosen] = useState<string | undefined>(undefined)
  const [doing, setDoing] = useState(false)
  const [note, setNote] = useState<{ text: string, error: boolean } | undefined>(undefined)
  const app = candidates.find(entry => entry.id === chosen) ?? candidates.find(entry => entry.state === 'running') ?? candidates[0]
  const running = app?.state === 'running'
  const caution = compatibilityNote(plugin)
  const add = async (): Promise<void> => {
    if (app === undefined || plugin.source === undefined) return
    setDoing(true)
    setNote(undefined)
    try {
      const result = await api.pullPlugin(app.id, plugin.source)
      setNote({ text: `Added ${plugin.name} to ${app.name}. ${result.text}`, error: false })
    } catch (cause) {
      setNote({ text: message(cause), error: true })
    } finally {
      setDoing(false)
    }
  }
  return (
    <section className="acrylHomeForm">
      <div className="acrylHomeRow"><button type="button" className="acrylHomeBtn" data-small onClick={onBack}>‹ All plugins</button></div>
      <article className="acrylHomeForm" aria-label={plugin.name}>
        <div className="acrylHomeHead">
          <div className="acrylHomeIcon" style={{ background: iconColor(plugin.id) }}>{initial(plugin.name)}</div>
          <div style={{ minWidth: 0 }}><h3 style={{ margin: 0 }}>{plugin.name}</h3><div className="acrylHomeMeta">{plugin.version === '' ? plugin.id : `${plugin.id} · v${plugin.version}`} · {plugin.compatibility}</div></div>
        </div>
        <PluginPills plugin={plugin} kinds={catalog.kinds} />
        <p className="acrylHomeDesc" style={{ WebkitLineClamp: 'unset', display: 'block' }}>{plugin.description}</p>
        {plugin.component === undefined ? null : <p className="acrylHomeNote">Implements: {plugin.component.name}</p>}
        {plugin.origin === 'community' ? <p className="acrylHomeNote" data-warn role="note">A Community plugin: released by someone outside the ACRYL project. Its code is not reviewed; add it only if you trust who released it.</p> : null}
        {caution === undefined ? null : <p className="acrylHomeNote" data-warn role="note">{caution}</p>}
      </article>
      <div className="acrylHomeSection">
        <div className="acrylHomeGroup">Add to an app</div>
        {plugin.source === undefined ? <p className="acrylHomeNote">The registry names no release of this plugin to pull yet.</p> : (
          <>
            {candidates.length === 0 ? <p className="acrylHomeNote">You have no app yet. Make one in My apps, then come back.</p> : (
              <div className="acrylHomeRow">
                <select className="acrylHomeInput" aria-label="App to add it to" value={app?.id ?? ''} onChange={(event) => { setChosen(event.target.value); setNote(undefined) }}>
                  {candidates.map(entry => <option key={entry.id} value={entry.id}>{entry.name} ({entry.state})</option>)}
                </select>
                {app !== undefined && app.state === 'stopped'
                  ? <button type="button" className="acrylHomeBtn" onClick={() => { void onStart(app.id) }}>Start {app.name}</button>
                  : null}
                <button type="button" className="acrylHomeBtn" data-primary disabled={doing || !running} onClick={() => { void add() }}>Add to {app?.name ?? 'an app'}</button>
              </div>
            )}
            {app !== undefined && !running ? <p className="acrylHomeNote">An app takes a plugin while it runs. {app.state === 'starting' ? `${app.name} is starting.` : `Start ${app.name} first.`}</p> : null}
            {doing ? <p className="acrylHomeNote" role="status">Pulling {plugin.source}: downloading it, checking its digest and installing it into {app?.name ?? 'the app'}...</p> : null}
            {note === undefined ? null : <p className="acrylHomeNote" data-error={note.error ? '' : undefined} role={note.error ? 'alert' : 'status'}>{note.text}</p>}
            <dl className="acrylHomeKv">
              <dt>Pull it with</dt><dd><span className="acrylHomeMeta">/plugin pull {plugin.source}</span></dd>
              <dt>Or in a terminal</dt><dd><span className="acrylHomeMeta">npm run acryl -- plugin pull {plugin.source}</span></dd>
            </dl>
          </>
        )}
        <div className="acrylHomeActs">
          {plugin.repo === '' ? null : <button type="button" className="acrylHomeBtn" onClick={() => { openExternal(plugin.repo) }}>Open its repository</button>}
          {plugin.page === undefined ? null : <button type="button" className="acrylHomeBtn" onClick={() => { if (plugin.page !== undefined) openExternal(plugin.page) }}>Open its registry page</button>}
        </div>
      </div>
    </section>
  )
}
