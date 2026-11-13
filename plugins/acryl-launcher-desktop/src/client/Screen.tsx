/**
 * The ACRYL screen: the Control Center design (spec 050 `design/control-center.html`) as the first screen of the desktop app. It draws what the Host
 * lists and sends what a person asks for; the rules (what an app is, what a name may be, how an app starts) are the Host's.
 */
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { MAKEABLE_SURFACES, SURFACES, type AppView, type BlendView, type NewAppRequest, type PluginView, type PublishPlanView, type PublishResponse, type StateResponse, type Surface } from '../contract.ts'
import type { HealthResponse, LauncherApi } from './api.ts'
import { blendAppName, iconColor, initial, runsLine, SURFACE_LABEL, surfaceNote, tilesOf, visibleApps, type SurfaceFilter } from './model.ts'
import { SITE_FONT_FACES } from './fonts.ts'
import { askAssistant, assistantWidth, openRightPanel, rightPanelWidth } from './right-panel.ts'
import { isDarkColor, readSkin, saveSkin, SKIN_LABEL, SKIN_NOTE, SKINS, type Skin } from './skin.ts'
import type { LauncherVisibility } from './store.ts'

export interface LauncherScreenProps {
  readonly api: LauncherApi
  readonly visibility: LauncherVisibility
  /** Desktop hands a web address opened by the window to the system browser. */
  readonly openExternal: (url: string) => void
}

type View = 'apps' | 'running' | 'drafts' | 'updates' | 'store' | 'cloud' | 'health' | 'settings'
/** What is open beside the list: nothing, the "+ New app" form, or the "Add a folder" form. */
type Panel = 'none' | 'new' | 'add'

const POLL_MS = 2000
const message = (cause: unknown): string => cause instanceof Error ? cause.message : String(cause)

export function LauncherScreen({ api, visibility, openExternal }: LauncherScreenProps): ReactNode {
  const open = useSyncExternalStore(visibility.subscribe, visibility.isOpen)
  const [state, setState] = useState<StateResponse | undefined>(undefined)
  const [problem, setProblem] = useState<string | undefined>(undefined)
  const [view, setView] = useState<View>('apps')
  const [panel, setPanel] = useState<Panel>('none')
  const [selected, setSelected] = useState<string | undefined>(undefined)
  const [search, setSearch] = useState('')
  const [surface, setSurface] = useState<SurfaceFilter>('all')
  const [skin, setSkin] = useState<Skin>(() => readSkin())
  const [dark, setDark] = useState(true)
  const [panelWidth, setPanelWidth] = useState(0)
  const [assistantOpen, setAssistantOpen] = useState(false)

  // The list is read again every two seconds while the screen is open: an app starting or ending shows without a click.
  useEffect(() => {
    if (!open) return undefined
    let live = true
    const read = (): void => { api.state().then((next) => { if (live) { setState(next); setProblem(undefined) } }, (cause: unknown) => { if (live) setProblem(message(cause)) }) }
    read()
    const timer = setInterval(read, POLL_MS)
    return () => { live = false; clearInterval(timer) }
  }, [api, open])

  // The acryl.dev skin carries its own typefaces (embedded, so it works offline): added while that skin is shown, removed after.
  useEffect(() => {
    if (skin !== 'site') return undefined
    const style = document.createElement('style')
    style.id = 'acryl-launcher-site-fonts'
    style.textContent = SITE_FONT_FACES
    document.head.appendChild(style)
    return () => { style.remove() }
  }, [skin])

  // The IDE's right panel (the assistant: terminals with Claude, Codex, Files, Changes) stays visible beside the screen: the screen stops where it starts.
  useEffect(() => {
    if (!open) return undefined
    const measure = (): void => {
      const assistant = assistantWidth()
      setAssistantOpen(assistant > 0)
      setPanelWidth(Math.max(rightPanelWidth(), assistant))
    }
    measure()
    const timer = setInterval(measure, 400)
    window.addEventListener('resize', measure)
    return () => { clearInterval(timer); window.removeEventListener('resize', measure) }
  }, [open])

  // Light or dark follows the page's own theme (the token the rest of the screen already uses), and again when the screen is opened.
  useEffect(() => {
    if (!open) return
    const token = getComputedStyle(document.documentElement).getPropertyValue('--dsw-alias-bg-base')
    setDark(isDarkColor(token) ?? window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true)
  }, [open])

  /** A change: send it, show the list it answers with, or the reason it was refused. */
  const act = useCallback(async (run: () => Promise<StateResponse>): Promise<boolean> => {
    try { setState(await run()); setProblem(undefined); return true } catch (cause) { setProblem(message(cause)); return false }
  }, [])

  if (!open) return <button type="button" className="acrylHomeBack" onClick={() => { visibility.set(true) }}>ACRYL</button>

  const apps = state?.apps ?? []
  const tiles = tilesOf(apps)
  const current = apps.find(app => app.id === selected) ?? apps[0]
  const nav = (id: View, label: string, count?: number): ReactNode => (
    <button type="button" className="acrylHomeNavItem" aria-current={view === id ? 'page' : undefined} onClick={() => { setView(id) }}>
      {label}{count === undefined ? null : <span className="acrylHomeCount">{count}</span>}
    </button>
  )

  return (
    <div className="acrylHome" role="dialog" aria-label="ACRYL" data-skin={skin} data-tone={dark ? 'dark' : 'light'} style={panelWidth > 0 ? { right: panelWidth } : undefined}>
      <nav className="acrylHomeNav" aria-label="ACRYL sections">
        <div className="acrylHomeBrand">ACRYL</div>
        {nav('apps', 'My apps', tiles.apps)}
        {nav('running', 'Running', tiles.running)}
        {nav('drafts', 'Made by agents', apps.filter(app => app.madeBy === 'agent').length)}
        {nav('updates', 'Updates')}
        <div className="acrylHomeSep" />
        {nav('store', 'Blends store')}
        {nav('cloud', 'WebBoxes.ai')}
        <div className="acrylHomeSep" />
        {nav('health', 'Health')}
        {nav('settings', 'Settings')}
        <div className="acrylHomeSep" />
        <button type="button" className="acrylHomeNavItem" aria-pressed={assistantOpen} title="Ask Claude to use the launcher for you: it can make apps, pull Blends and plugins, start and stop them, and answer how to use this screen" onClick={() => { if (assistantOpen) { askAssistant({ open: false }); return } api.assistantFolder().then((cwd) => { askAssistant({ open: true, cwd }) }, (cause: unknown) => { setProblem(message(cause)); askAssistant({ open: true }) }) }}>Assistant{assistantOpen ? <span className="acrylHomeCount">open</span> : null}</button>
        <button type="button" className="acrylHomeNavItem" title="Open the IDE's right panel beside this screen: terminals where Codex or any CLI agent runs, Files, Changes" onClick={() => { openRightPanel() }}>Agent terminals</button>
      </nav>
      <main className="acrylHomeMain">
        {problem === undefined ? null : <p className="acrylHomeNote" data-error role="alert">{problem}</p>}
        {state?.job == null ? null : <JobBanner job={state.job} />}
        {view === 'apps' && (
          <AppsView
            api={api} apps={apps} tiles={tiles} current={current} search={search} surface={surface} panel={panel} state={state}
            onSearch={setSearch} onSurface={setSurface} onPanel={setPanel} onSelect={setSelected}
            onAdd={async path => { const done = await act(() => api.add(path)); if (done) setPanel('none'); return done }}
            onCreate={async request => { const done = await act(() => api.create(request)); if (done) setPanel('none'); return done }}
            onStart={id => act(() => api.start(id))} onStop={id => act(() => api.stop(id))} onRemove={id => act(() => api.remove(id))}
            openExternal={openExternal} onOpenCode={() => { visibility.set(false) }}
          />
        )}
        {view === 'running' && <RunningView apps={apps.filter(app => app.state === 'running' || app.state === 'starting')} openExternal={openExternal} onStop={id => act(() => api.stop(id))} />}
        {view === 'drafts' && <DraftsView apps={apps.filter(app => app.madeBy === 'agent')} />}
        {view === 'updates' && <Empty title="Updates" text="Updates are not checked from this screen yet. In a terminal, `acryl update` in an app's folder updates it after a check, and a failed check keeps the old version." />}
        {view === 'store' && <StoreView api={api} state={state} onCreate={async (request) => { const done = await act(() => api.create(request)); if (done) setView('apps'); return done }} />}
        {view === 'cloud' && <Empty title="On WebBoxes.ai" text="Deploying an app to WebBoxes.ai from its card is coming (`acryl deploy`). Nothing of yours is there yet." />}
        {view === 'health' && <HealthView api={api} />}
        {view === 'settings' && <SettingsView api={api} appsFolder={state?.appsFolder ?? ''} skin={skin} onSkin={(next) => { setSkin(next); saveSkin(next) }} />}
      </main>
    </div>
  )
}

function JobBanner({ job }: { job: NonNullable<StateResponse['job']> }): ReactNode {
  const head = job.status === 'running' ? `Making ${job.name} (this installs it, about a minute)` : job.status === 'done' ? `${job.name} is made` : `${job.name} could not be made`
  return <div className="acrylHomeJob" role="status"><b>{head}</b>{'\n'}<span className="acrylHomeMeta">{job.line}</span>{job.message === undefined ? null : `\n${job.message}`}</div>
}

function Empty({ title, text }: { title: string, text: string }): ReactNode {
  return <section className="acrylHomeForm"><h3 style={{ margin: 0 }}>{title}</h3><p className="acrylHomeNote">{text}</p></section>
}

function StateLabel({ app }: { app: AppView }): ReactNode {
  const label = app.state === 'running' ? 'running' : app.state === 'starting' ? 'starting' : app.state === 'missing' ? 'folder is gone' : 'stopped'
  return <span className="acrylHomeState" data-state={app.state}><i />{label}{app.address === undefined ? null : <> · <span className="acrylHomeMeta">{app.address.replace(/\?.*$/u, '')}</span></>}</span>
}

function SurfaceChip({ surface }: { surface: Surface }): ReactNode {
  return <span className="acrylHomePill" data-kind={surface === 'tui' ? 'off' : undefined}>{SURFACE_LABEL[surface]}</span>
}

interface AppsViewProps {
  readonly api: LauncherApi
  readonly apps: readonly AppView[]
  readonly tiles: ReturnType<typeof tilesOf>
  readonly current: AppView | undefined
  readonly search: string
  readonly surface: SurfaceFilter
  readonly panel: Panel
  readonly state: StateResponse | undefined
  readonly onSearch: (value: string) => void
  readonly onSurface: (value: SurfaceFilter) => void
  readonly onPanel: (value: Panel) => void
  readonly onSelect: (id: string) => void
  readonly onAdd: (path: string) => Promise<boolean>
  readonly onCreate: (request: NewAppRequest) => Promise<boolean>
  readonly onStart: (id: string) => Promise<boolean>
  readonly onStop: (id: string) => Promise<boolean>
  readonly onRemove: (id: string) => Promise<boolean>
  readonly openExternal: (url: string) => void
  /** Leave this screen for the coding workspace underneath it (ACRYL ADE is the agentic development environment, in this same window). */
  readonly onOpenCode: () => void
}

function AppsView(props: AppsViewProps): ReactNode {
  const shown = visibleApps(props.apps, props.search, props.surface)
  const { current } = props
  // ACRYL ADE is always on this machine and always a Desktop app: it answers the Desktop filter and the words it is named by.
  const showCode = (props.surface === 'all' || props.surface === 'desktop') && 'acryl ade agentic development environment code ide'.includes(props.search.trim().toLowerCase())
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="acrylHomeTop">
        <input className="acrylHomeSearch" type="search" placeholder="Search apps, Blends, folders..." aria-label="Search apps" value={props.search} onChange={(event) => { props.onSearch(event.target.value) }} />
        <button type="button" className="acrylHomeBtn" data-primary onClick={() => { props.onPanel(props.panel === 'new' ? 'none' : 'new') }}>+ New app</button>
        <button type="button" className="acrylHomeBtn" onClick={() => { props.onPanel(props.panel === 'add' ? 'none' : 'add') }}>Add a folder</button>
      </div>
      {props.panel === 'new' && props.state !== undefined && <NewAppForm state={props.state} onCreate={props.onCreate} onCancel={() => { props.onPanel('none') }} />}
      {props.panel === 'add' && <AddFolderForm onAdd={props.onAdd} onCancel={() => { props.onPanel('none') }} />}
      <div className="acrylHomeChips" role="group" aria-label="Surface">
        <button type="button" className="acrylHomeChip" aria-pressed={props.surface === 'all'} onClick={() => { props.onSurface('all') }}>All</button>
        {SURFACES.map(kind => (
          <button key={kind} type="button" className="acrylHomeChip" aria-pressed={props.surface === kind} disabled={surfaceNote(kind) !== undefined} title={surfaceNote(kind)} onClick={() => { props.onSurface(kind) }}>
            {SURFACE_LABEL[kind]}{surfaceNote(kind) === undefined ? null : ` (${surfaceNote(kind)!})`}
          </button>
        ))}
      </div>
      <div className="acrylHomeTiles">
        <div className="acrylHomeTile"><b>{props.tiles.apps}</b><span>apps on this machine</span></div>
        <div className="acrylHomeTile" data-tone="ok"><b>{props.tiles.running}</b><span>running now</span></div>
        <div className="acrylHomeTile" data-tone="warn"><b>{props.tiles.updates}</b><span>updates waiting</span></div>
        <div className="acrylHomeTile" data-tone="cloud"><b>{props.tiles.cloud}</b><span>on WebBoxes.ai</span></div>
      </div>
      <div className="acrylHomeGroup">Recent</div>
      <div className="acrylHomeApps">
        {showCode && (
          <div className="acrylHomeApp" data-code>
            <div className="acrylHomeHead">
              <div className="acrylHomeIcon" style={{ background: '#0f766e' }}>C</div>
              <div style={{ minWidth: 0 }}><div className="acrylHomeName">ACRYL ADE</div><div className="acrylHomeMeta">the agentic development environment, in this window</div></div>
            </div>
            <div className="acrylHomeRow"><SurfaceChip surface="desktop" /></div>
            <div className="acrylHomeRow"><button type="button" className="acrylHomeBtn" data-primary onClick={props.onOpenCode}>Open ACRYL ADE</button></div>
          </div>
        )}
        {shown.map(app => (
          <button key={app.id} type="button" className="acrylHomeApp" aria-pressed={app.id === current?.id} onClick={() => { props.onSelect(app.id) }}>
            <div className="acrylHomeHead">
              <div className="acrylHomeIcon" style={{ background: iconColor(app.id) }}>{initial(app.name)}</div>
              <div style={{ minWidth: 0 }}><div className="acrylHomeName">{app.name}</div><div className="acrylHomeMeta">{app.blend === '' ? 'no Blend named' : app.blend}</div></div>
            </div>
            <div className="acrylHomeRow"><StateLabel app={app} /></div>
            <div className="acrylHomeRow"><SurfaceChip surface={app.surface} />{app.madeBy === 'agent' ? <span className="acrylHomePill" data-kind="agent">by agent</span> : null}</div>
          </button>
        ))}
      </div>
      {props.apps.length === 0
        ? <p className="acrylHomeNote">No apps of your own yet. Press + New app to make one, or Add a folder to list one you already have.</p>
        : shown.length === 0 ? <p className="acrylHomeNote">No app matches.</p> : null}
      {current === undefined ? null : <Detail api={props.api} app={current} onStart={props.onStart} onStop={props.onStop} onRemove={props.onRemove} openExternal={props.openExternal} />}
    </div>
  )
}

function Detail({ api, app, onStart, onStop, onRemove, openExternal }: { api: LauncherApi, app: AppView, onStart: (id: string) => Promise<boolean>, onStop: (id: string) => Promise<boolean>, onRemove: (id: string) => Promise<boolean>, openExternal: (url: string) => void }): ReactNode {
  const running = app.state === 'running' || app.state === 'starting'
  return (
    <div className="acrylHomePanel" aria-live="polite">
      <div className="acrylHomePanelTop">
        <h3>{app.name}</h3>
        <div className="acrylHomeActs">
          {running
            ? <>{app.surface === 'desktop' ? null : <button type="button" className="acrylHomeBtn" data-primary disabled={app.address === undefined} onClick={() => { if (app.address !== undefined) openExternal(app.address) }}>Open</button>}<button type="button" className="acrylHomeBtn" onClick={() => { void onStop(app.id) }}>Stop</button></>
            : <button type="button" className="acrylHomeBtn" data-primary disabled={app.state === 'missing'} onClick={() => { void onStart(app.id) }}>Start</button>}
          <button type="button" className="acrylHomeBtn" disabled title="coming: acryl deploy">Deploy to WebBoxes.ai</button>
          <button type="button" className="acrylHomeBtn" disabled title="coming">Share</button>
          <button type="button" className="acrylHomeBtn" disabled title="coming">Open folder</button>
          <button type="button" className="acrylHomeBtn" onClick={() => { void onRemove(app.id) }} title="Takes it off this list; the folder stays">Remove from list</button>
        </div>
      </div>
      <dl className="acrylHomeKv">
        <dt>Blend</dt><dd>{app.blend === '' ? 'none named' : app.blend}</dd>
        <dt>Surface</dt><dd>{SURFACE_LABEL[app.surface]}</dd>
        <dt>Folder</dt><dd>{app.path}</dd>
        <dt>Made by</dt><dd>{app.madeBy === 'agent' ? 'an agent' : 'you'}</dd>
        <dt>Address</dt><dd>{app.address === undefined ? 'not running' : app.address.replace(/\?.*$/u, '')}</dd>
        <dt>Runs</dt><dd>{runsLine(app)}</dd>
      </dl>
      {running ? <PluginsPanel api={api} app={app} /> : <p className="acrylHomeNote">Start the app to pull plugins into it and share the ones made in it.</p>}
      {app.failure === undefined ? null : <p className="acrylHomeNote" data-error>It stopped on its own:{'\n'}{app.failure}</p>}
    </div>
  )
}

/** The plugins of a running app: what it has, pulling one from a registry, and sharing one made here (the app's plan, then the person's yes). */
function PluginsPanel({ api, app }: { api: LauncherApi, app: AppView }): ReactNode {
  const [plugins, setPlugins] = useState<readonly PluginView[] | undefined>(undefined)
  const [source, setSource] = useState('')
  const [sharing, setSharing] = useState<string | undefined>(undefined)
  const [owner, setOwner] = useState('')
  const [plan, setPlan] = useState<PublishPlanView | undefined>(undefined)
  const [done, setDone] = useState<PublishResponse | undefined>(undefined)
  const [note, setNote] = useState<{ text: string, error: boolean } | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const ready = app.state === 'running'

  const run = async (work: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setNote(undefined)
    try { await work() } catch (cause) { setNote({ text: message(cause), error: true }) } finally { setBusy(false) }
  }

  // The list is asked for when the app is running (its door answers then), and again when the app changes.
  useEffect(() => {
    if (!ready) return undefined
    let live = true
    setPlugins(undefined)
    api.plugins(app.id).then((list) => { if (live) setPlugins(list) }, (cause: unknown) => { if (live) setNote({ text: message(cause), error: true }) })
    return () => { live = false }
  }, [api, app.id, ready])

  const owned = (plugins ?? []).filter(plugin => plugin.pulledFrom === undefined)
  const pulled = (plugins ?? []).filter(plugin => plugin.pulledFrom !== undefined)
  const owner_ = owner.trim() === '' ? {} : { owner: owner.trim() }
  return (
    <div className="acrylHomeSection">
      <div className="acrylHomeGroup">Plugins</div>
      {!ready ? <p className="acrylHomeNote">The app is starting; its plugins show when it is up.</p> : null}
      {ready && plugins === undefined && note === undefined ? <p className="acrylHomeNote">Reading the app's plugins...</p> : null}
      {plugins !== undefined && plugins.length === 0 ? <p className="acrylHomeNote">This app has no plugins of its own yet.</p> : null}
      {owned.length + pulled.length > 0 ? (
        <div className="acrylHomeList">
          {[...owned, ...pulled].map(plugin => (
            <div className="acrylHomeItem" key={plugin.name} data-plain>
              <div className="acrylHomeIcon" style={{ background: iconColor(plugin.name) }}>{initial(plugin.name)}</div>
              <div><b>{plugin.name}</b><small>{plugin.pulledFrom === undefined ? `made in this app · ${plugin.state}` : `pulled from ${plugin.pulledFrom}${plugin.author === undefined ? '' : ` · by ${plugin.author}`}`}</small></div>
              <div className="acrylHomeActs">
                {plugin.pulledFrom === undefined
                  ? <button type="button" className="acrylHomeBtn" data-small disabled={busy} onClick={() => { setSharing(plugin.name); setPlan(undefined); setDone(undefined); setNote(undefined) }}>Share plugin</button>
                  : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <form className="acrylHomeRow" onSubmit={(event) => {
        event.preventDefault()
        void run(async () => {
          const result = await api.pullPlugin(app.id, source.trim())
          setPlugins(result.plugins)
          setSource('')
          setNote({ text: `Pulled ${source.trim()}.`, error: false })
        })
      }}>
        <input className="acrylHomeInput" data-mono style={{ flex: '1 1 280px' }} value={source} placeholder="github:owner/repo@version" aria-label="Plugin to pull" disabled={!ready} onChange={(event) => { setSource(event.target.value) }} />
        <button type="submit" className="acrylHomeBtn" data-primary disabled={busy || !ready || source.trim() === ''}>Pull a plugin</button>
      </form>
      {sharing === undefined ? null : (
        <div className="acrylHomePanel" role="group" aria-label={`Share ${sharing}`}>
          <div className="acrylHomePanelTop"><h3>Share {sharing}</h3><button type="button" className="acrylHomeBtn" data-small onClick={() => { setSharing(undefined); setPlan(undefined); setDone(undefined) }}>Close</button></div>
          {done !== undefined ? (
            <>
              <p className="acrylHomeNote">Published: <span className="acrylHomeMeta">{done.releaseUrl}</span></p>
              <p className="acrylHomeNote">A friend gets exactly these bytes with <span className="acrylHomeMeta">{done.pullLine}</span></p>
            </>
          ) : plan === undefined ? (
            <form className="acrylHomeRow" onSubmit={(event) => {
              event.preventDefault()
              void run(async () => { setPlan(await api.publishPlan({ id: app.id, plugin: sharing, ...owner_ })) })
            }}>
              <input className="acrylHomeInput" style={{ flex: '1 1 240px' }} value={owner} placeholder="GitHub account (blank: yours)" aria-label="GitHub account" onChange={(event) => { setOwner(event.target.value) }} />
              <button type="submit" className="acrylHomeBtn" data-primary disabled={busy}>Review what would be sent</button>
            </form>
          ) : (
            <>
              <dl className="acrylHomeKv">
                <dt>Repository</dt><dd>{plan.owner}/{plan.repo}{plan.createsRepository ? ' (a new repository)' : ''}</dd>
                <dt>Version</dt><dd>{plan.version} · {plan.visibility} · {plan.license}</dd>
                <dt>Files</dt><dd>{plan.files.join(', ')}</dd>
                <dt>A friend pulls it with</dt><dd>{plan.pullLine}</dd>
              </dl>
              <p className="acrylHomeNote">Nothing has been sent. It is sent only when you say yes.</p>
              <div className="acrylHomeActs">
                <button type="button" className="acrylHomeBtn" data-primary disabled={busy} onClick={() => { void run(async () => { setDone(await api.publish({ id: app.id, plugin: sharing, ...owner_, plan })) }) }}>Yes, publish {plan.owner}/{plan.repo}</button>
                <button type="button" className="acrylHomeBtn" disabled={busy} onClick={() => { setPlan(undefined) }}>Not yet</button>
              </div>
            </>
          )}
        </div>
      )}
      {note === undefined ? null : <p className="acrylHomeNote" data-error={note.error ? '' : undefined} role={note.error ? 'alert' : 'status'}>{note.text}</p>}
    </div>
  )
}

function NewAppForm({ state, blend, onCreate, onCancel }: { state: StateResponse, blend?: BlendView, onCreate: (request: NewAppRequest) => Promise<boolean>, onCancel: () => void }): ReactNode {
  const [where, setWhere] = useState(state.appsFolder)
  const [name, setName] = useState(blend === undefined ? '' : blendAppName(blend.id))
  const [starter, setStarter] = useState(state.starters[0]?.value ?? 'blank')
  const [surface, setSurface] = useState<Surface>('web')
  const [busy, setBusy] = useState(false)
  const line = `cd ${where} && acryl new ${name === '' ? '<name>' : name} ${blend === undefined ? starter : `--from ${blend.id}`}`
  return (
    <form className="acrylHomePanel acrylHomeForm" onSubmit={(event) => { event.preventDefault(); setBusy(true); void onCreate({ where, name, surface, ...blend === undefined ? { starter } : { blend: blend.id } }).finally(() => { setBusy(false) }) }}>
      <div className="acrylHomePanelTop"><h3>{blend === undefined ? 'New app' : `New app from ${blend.name}`}</h3></div>
      <label className="acrylHomeField"><span>Where does it go?</span><input className="acrylHomeInput" data-mono value={where} onChange={(event) => { setWhere(event.target.value) }} aria-label="Where does it go" /></label>
      <label className="acrylHomeField"><span>Name</span><input className="acrylHomeInput" value={name} placeholder="my-app" autoFocus onChange={(event) => { setName(event.target.value) }} aria-label="Name" /></label>
      {blend !== undefined ? <p className="acrylHomeNote">{blend.description}</p> : <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="acrylHomeField"><span>Starter</span></legend>
        <div className="acrylHomeChoices">
          {state.starters.map(entry => (
            <label key={entry.value} className="acrylHomeChoice"><input type="radio" name="starter" checked={starter === entry.value} onChange={() => { setStarter(entry.value) }} /><span>{entry.label}<small>{entry.description}</small></span></label>
          ))}
        </div>
      </fieldset>}
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="acrylHomeField"><span>Surface</span></legend>
        <div className="acrylHomeChoices">
          {SURFACES.map((kind) => {
            const note = surfaceNote(kind)
            return (
              <label key={kind} className="acrylHomeChoice" data-disabled={note === undefined ? undefined : ''}>
                <input type="radio" name="surface" disabled={!MAKEABLE_SURFACES.includes(kind)} checked={surface === kind} onChange={() => { setSurface(kind) }} />
                <span>{SURFACE_LABEL[kind]}{note === undefined ? null : ` (${note})`}<small>{kind === 'web' ? 'served at an address, opened in a browser' : kind === 'desktop' ? 'a window of its own' : 'the lightest: the same plugins, a terminal screen'}</small></span>
              </label>
            )
          })}
        </div>
      </fieldset>
      <p className="acrylHomeNote">Same as typing <span className="acrylHomeMeta">{line}</span></p>
      <div className="acrylHomeActs"><button type="submit" className="acrylHomeBtn" data-primary disabled={busy || name === ''}>Make it</button><button type="button" className="acrylHomeBtn" onClick={onCancel}>Cancel</button></div>
    </form>
  )
}

/** The public registry's Blends, read when the store opens; "Make an app" opens the New app form for the chosen one. */
function StoreView({ api, state, onCreate }: { api: LauncherApi, state: StateResponse | undefined, onCreate: (request: NewAppRequest) => Promise<boolean> }): ReactNode {
  const [blends, setBlends] = useState<readonly BlendView[] | undefined>(undefined)
  const [failed, setFailed] = useState<string | undefined>(undefined)
  const [search, setSearch] = useState('')
  const [chosen, setChosen] = useState<BlendView | undefined>(undefined)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let live = true
    setFailed(undefined)
    api.blends().then((list) => { if (live) setBlends(list) }, (cause: unknown) => { if (live) setFailed(message(cause)) })
    return () => { live = false }
  }, [api, attempt])
  const needle = search.trim().toLowerCase()
  const shown = (blends ?? []).filter(blend => needle === '' || `${blend.name} ${blend.id} ${blend.category} ${blend.description}`.toLowerCase().includes(needle))
  return (
    <section className="acrylHomeForm">
      <h3 style={{ margin: 0 }}>Blends store</h3>
      <p className="acrylHomeNote">Ready-made apps from the public registry (acrylblends.github.io/blends). Making one is the same as <span className="acrylHomeMeta">acryl new &lt;name&gt; --from &lt;id&gt;</span>.</p>
      {chosen !== undefined && state !== undefined ? <NewAppForm key={chosen.id} state={state} blend={chosen} onCreate={onCreate} onCancel={() => { setChosen(undefined) }} /> : null}
      <input className="acrylHomeSearch" type="search" value={search} placeholder="Search Blends..." aria-label="Search Blends" onChange={(event) => { setSearch(event.target.value) }} />
      {failed !== undefined ? <p className="acrylHomeNote" data-error role="alert">{failed} <button type="button" className="acrylHomeBtn" data-small onClick={() => { setAttempt(attempt + 1) }}>Try again</button></p> : null}
      {blends === undefined && failed === undefined ? <p className="acrylHomeNote">Reading the registry...</p> : null}
      {blends !== undefined && shown.length === 0 ? <p className="acrylHomeNote">No Blend matches.</p> : null}
      <div className="acrylHomeCards">
        {shown.map(blend => (
          <div className="acrylHomeApp" key={blend.id}>
            <div className="acrylHomeHead">
              <div className="acrylHomeIcon" style={{ background: iconColor(blend.id) }}>{initial(blend.name)}</div>
              <div style={{ minWidth: 0 }}><div className="acrylHomeName">{blend.name}</div><div className="acrylHomeMeta">{blend.id}</div></div>
            </div>
            <p className="acrylHomeDesc">{blend.description}</p>
            <div className="acrylHomeCardFoot">
              <div className="acrylHomeRow">{blend.category === '' ? null : <span className="acrylHomePill">{blend.category}</span>}{blend.version === '' ? null : <span className="acrylHomeMeta">{blend.version}</span>}</div>
              <button type="button" className="acrylHomeBtn" data-small data-primary disabled={state === undefined} onClick={() => { setChosen(blend) }}>Make an app</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function AddFolderForm({ onAdd, onCancel }: { onAdd: (path: string) => Promise<boolean>, onCancel: () => void }): ReactNode {
  const [path, setPath] = useState('')
  return (
    <form className="acrylHomePanel acrylHomeForm" onSubmit={(event) => { event.preventDefault(); void onAdd(path) }}>
      <div className="acrylHomePanelTop"><h3>Add a folder</h3></div>
      <label className="acrylHomeField"><span>The folder of an ACRYL app (it has a blend.yaml)</span><input className="acrylHomeInput" data-mono value={path} autoFocus placeholder="/Users/you/work/crm" onChange={(event) => { setPath(event.target.value) }} aria-label="Folder" /></label>
      <p className="acrylHomeNote">Same as typing <span className="acrylHomeMeta">acryl apps add {path === '' ? '<folder>' : path}</span>. Nothing scans the disk by itself.</p>
      <div className="acrylHomeActs"><button type="submit" className="acrylHomeBtn" data-primary disabled={path.trim() === ''}>Add it</button><button type="button" className="acrylHomeBtn" onClick={onCancel}>Cancel</button></div>
    </form>
  )
}

function RunningView({ apps, openExternal, onStop }: { apps: readonly AppView[], openExternal: (url: string) => void, onStop: (id: string) => Promise<boolean> }): ReactNode {
  return (
    <section className="acrylHomeForm">
      <h3 style={{ margin: 0 }}>Running now</h3>
      {apps.length === 0 ? <p className="acrylHomeNote">Nothing is running. Start an app from My apps.</p> : (
        <div className="acrylHomeList">
          {apps.map(app => (
            <div className="acrylHomeItem" key={app.id}>
              <div className="acrylHomeIcon" style={{ background: iconColor(app.id) }}>{initial(app.name)}</div>
              <div><b>{app.name}</b><small>{app.address === undefined ? 'starting' : app.address.replace(/\?.*$/u, '')}</small></div>
              <div className="acrylHomeActs"><button type="button" className="acrylHomeBtn" data-small disabled={app.address === undefined} onClick={() => { if (app.address !== undefined) openExternal(app.address) }}>Open</button><button type="button" className="acrylHomeBtn" data-small onClick={() => { void onStop(app.id) }}>Stop</button></div>
            </div>
          ))}
        </div>
      )}
      <p className="acrylHomeNote">Apps this screen started stop when ACRYL quits.</p>
    </section>
  )
}

function DraftsView({ apps }: { apps: readonly AppView[] }): ReactNode {
  return (
    <section className="acrylHomeForm">
      <h3 style={{ margin: 0 }}>Made by agents</h3>
      <p className="acrylHomeNote">An agent adds an app to ACRYL only when it asks you to keep it; until then it is just a folder wherever you told it to work.</p>
      {apps.length === 0 ? <p className="acrylHomeNote">No agent has asked to keep an app yet.</p> : (
        <div className="acrylHomeList">
          {apps.map(app => <div className="acrylHomeItem" key={app.id}><div className="acrylHomeIcon" style={{ background: iconColor(app.id) }}>{initial(app.name)}</div><div><b>{app.name}</b> <span className="acrylHomePill" data-kind="agent">by agent</span><small>{app.path}</small></div><span /></div>)}
        </div>
      )}
    </section>
  )
}

function HealthView({ api }: { api: LauncherApi }): ReactNode {
  const [health, setHealth] = useState<HealthResponse | undefined>(undefined)
  const [problem, setProblem] = useState<string | undefined>(undefined)
  useEffect(() => {
    let live = true
    api.health().then((next) => { if (live) setHealth(next) }, (cause: unknown) => { if (live) setProblem(message(cause)) })
    return () => { live = false }
  }, [api])
  const row = (ok: boolean, title: string, detail: string): ReactNode => (
    <div className="acrylHomeItem"><div className="acrylHomeIcon" style={{ background: ok ? 'var(--h-ok)' : 'var(--h-warn)' }}>{ok ? '✓' : '!'}</div><div><b>{title}</b><small>{detail}</small></div><span className="acrylHomePill" data-kind={ok ? undefined : 'warn'}>{ok ? 'ok' : 'check'}</span></div>
  )
  return (
    <section className="acrylHomeForm">
      <h3 style={{ margin: 0 }}>Health</h3>
      {problem === undefined ? null : <p className="acrylHomeNote" data-error>{problem}</p>}
      {health === undefined ? <p className="acrylHomeNote">Checking this machine...</p> : (
        <div className="acrylHomeList">
          {row(health.node !== undefined, health.node === undefined ? 'Node.js not found' : `Node ${health.node}`, health.node === undefined ? 'Install Node.js 22.19 or later from nodejs.org: apps are made and started with it.' : 'found on this machine')}
          {row(health.npm !== undefined, health.npm === undefined ? 'npm not found' : `npm ${health.npm}`, health.npm === undefined ? 'It comes with Node.js.' : 'found on this machine')}
          {row(health.modelKey, 'Model key', health.modelKey ? `saved once for every app (${health.keyMask ?? 'hidden'})` : 'not saved: run `acryl model set deepseek` in a terminal')}
        </div>
      )}
    </section>
  )
}

function SettingsView({ api, appsFolder, skin, onSkin }: { api: LauncherApi, appsFolder: string, skin: Skin, onSkin: (skin: Skin) => void }): ReactNode {
  const [health, setHealth] = useState<HealthResponse | undefined>(undefined)
  useEffect(() => {
    let live = true
    api.health().then((next) => { if (live) setHealth(next) }, () => undefined)
    return () => { live = false }
  }, [api])
  return (
    <section className="acrylHomeForm">
      <h3 style={{ margin: 0 }}>Settings</h3>
      <dl className="acrylHomeKv" style={{ gridTemplateColumns: '200px minmax(0, 1fr)' }}>
        <dt>Where new apps go</dt><dd>{appsFolder} (suggested each time)</dd>
        <dt>ACRYL's own records</dt><dd>{health?.home ?? '...'}</dd>
        <dt>Model provider</dt><dd>{health === undefined ? '...' : health.modelKey ? `DeepSeek (${health.keyMask ?? 'saved'}), shared by every app` : 'none saved'}</dd>
        <dt>On quit</dt><dd>stops the apps it started</dd>
      </dl>
      <p className="acrylHomeNote">These are shown, not edited, here yet. `acryl model` sets the model key.</p>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="acrylHomeField"><span>Look</span></legend>
        <div className="acrylHomeChoices">
          {SKINS.map(kind => (
            <label key={kind} className="acrylHomeChoice">
              <input type="radio" name="skin" checked={skin === kind} onChange={() => { onSkin(kind) }} />
              <span>{SKIN_LABEL[kind]}<small>{SKIN_NOTE[kind]}</small></span>
            </label>
          ))}
        </div>
      </fieldset>
    </section>
  )
}
