/**
 * The ACRYL screen: the Control Center design (spec 050 `design/control-center.html`) as the first screen of the desktop app. It draws what the Host
 * lists and sends what a person asks for; the rules (what an app is, what a name may be, how an app starts) are the Host's.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { MAKEABLE_SURFACES, SURFACES, webboxesDeployBlendUrl, webboxesDeployUrl, type AppSharePlanView, type AppShareResponse, type AppView, type BlendView, type NewAppRequest, type PluginView, type PublishPlanView, type PublishResponse, type StateResponse, type Surface } from '../contract.ts'
import type { HealthResponse, LauncherApi } from './api.ts'
import { blendAppName, folderName, iconColor, storeCategories, initial, runsLine, SURFACE_LABEL, surfaceNote, tilesOf, visibleApps, type SurfaceFilter } from './model.ts'
import { SITE_FONT_FACES } from './fonts.ts'
import { PluginStoreView } from './PluginStore.tsx'
import { readRail, saveRail } from './skin.ts'
import { isDarkColor, readSkin, saveSkin, SKIN_LABEL, SKIN_NOTE, SKINS, type Skin } from './skin.ts'
import type { LauncherVisibility } from './store.ts'

export interface LauncherScreenProps {
  readonly api: LauncherApi
  readonly visibility: LauncherVisibility
  /** Desktop hands a web address opened by the window to the system browser. */
  readonly openExternal: (url: string) => void
  /** The ACRYL app: ACRYL ADE is the workspace under this screen, in the same window. Elsewhere (the launcher Blend) it is its own app, opened through the Host. */
  readonly adeUnderneath?: boolean
}

type View = 'apps' | 'running' | 'drafts' | 'updates' | 'store' | 'plugins' | 'cloud' | 'health' | 'settings'
/** What is open beside the list: nothing, the "+ New app" form, or the "Add a folder" form. */
type Panel = 'none' | 'new' | 'add'

const POLL_MS = 2000
const message = (cause: unknown): string => cause instanceof Error ? cause.message : String(cause)

export function LauncherScreen({ api, visibility, openExternal, adeUnderneath = true }: LauncherScreenProps): ReactNode {
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
  const [rail, setRail] = useState<boolean>(() => readRail())

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


  // Light or dark follows the page's own theme (the token the rest of the screen already uses), and again when the screen is opened.
  useEffect(() => {
    if (!open) return
    const token = getComputedStyle(document.documentElement).getPropertyValue('--dsw-alias-bg-base')
    setDark(isDarkColor(token) ?? window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true)
  }, [open])

  /** A new app: make it and show the list it answers with, or hand the reason it was refused back to the form that asked (shown beside its button). */
  const create = useCallback(async (request: NewAppRequest): Promise<string | undefined> => {
    try { setState(await api.create(request)); setProblem(undefined); return undefined } catch (cause) { return message(cause) }
  }, [api])

  /** A change: send it, show the list it answers with, or the reason it was refused. */
  const act = useCallback(async (run: () => Promise<StateResponse>): Promise<boolean> => {
    try { setState(await run()); setProblem(undefined); return true } catch (cause) { setProblem(message(cause)); return false }
  }, [])

  if (!open) return <button type="button" className="acrylHomeBack" onClick={() => { visibility.set(true) }}>ACRYL</button>

  const apps = state?.apps ?? []
  const tiles = tilesOf(apps)
  const current = apps.find(app => app.id === selected) ?? apps[0]
  const nav = (id: View, label: string, count?: number): ReactNode => (
    <button type="button" className="acrylHomeNavItem" title={label} aria-current={view === id ? 'page' : undefined} onClick={() => { setView(id) }}>
      <span className="acrylHomeGlyph" aria-hidden="true">{label.slice(0, 1)}</span><span className="acrylHomeLabel">{label}</span>{count === undefined ? null : <span className="acrylHomeCount">{count}</span>}
    </button>
  )

  return (
    <div className="acrylHome" role="dialog" aria-label="ACRYL" data-skin={skin} data-tone={dark ? 'dark' : 'light'} data-nav={rail ? 'rail' : 'full'}>
      <nav className="acrylHomeNav" aria-label="ACRYL sections">
        <div className="acrylHomeBrand"><span className="acrylHomeLabel">ACRYL</span><button type="button" className="acrylHomeRailToggle" aria-label={rail ? 'Expand the sidebar' : 'Collapse the sidebar'} title={rail ? 'Expand the sidebar' : 'Collapse the sidebar'} onClick={() => { setRail(!rail); saveRail(!rail) }}>{rail ? '»' : '«'}</button></div>
        {nav('apps', 'My apps', tiles.apps)}
        {nav('running', 'Running', tiles.running)}
        {nav('drafts', 'Made by agents', apps.filter(app => app.madeBy === 'agent').length)}
        {nav('updates', 'Updates', tiles.updates)}
        <div className="acrylHomeSep" />
        {nav('store', 'Blends store')}
        {nav('plugins', 'Plugin catalog')}
        {nav('cloud', 'WebBoxes.ai')}
        <div className="acrylHomeSep" />
        {nav('health', 'Health')}
        {nav('settings', 'Settings')}
      </nav>
      <main className="acrylHomeMain">
        {problem === undefined ? null : <p className="acrylHomeNote" data-error role="alert">{problem}</p>}
        {state?.self === undefined || state.self.status === 'checking' || state.self.status === 'current' ? null : <SelfBanner self={state.self} onUpdate={() => { void act(() => api.updateSelf()) }} />}
        {state?.job == null ? null : <JobBanner job={state.job} openExternal={openExternal} />}
        {view === 'apps' && (
          <AppsView
            api={api} apps={apps} tiles={tiles} current={current} search={search} surface={surface} panel={panel} state={state}
            onSearch={setSearch} onSurface={setSurface} onPanel={setPanel} onSelect={setSelected}
            onAdd={async path => { const done = await act(() => api.add(path)); if (done) setPanel('none'); return done }}
            onCreate={async request => { const refused = await create(request); if (refused === undefined) setPanel('none'); return refused }}
            onStart={id => act(() => api.start(id))} onStop={id => act(() => api.stop(id))} onUpdate={id => act(() => api.update(id))} onBuild={id => act(() => api.buildInstaller(id))} onTeamRelease={id => act(() => api.teamRelease(id))} onRemove={id => act(() => api.remove(id))} onApplications={(id, on) => act(() => api.inApplications(id, on))}
            openExternal={openExternal} adeUnderneath={adeUnderneath} onOpenCode={() => { visibility.set(false) }} onOpenAde={surface => { void act(() => api.openAde(surface)) }}
          />
        )}
        {view === 'running' && <RunningView apps={apps.filter(app => app.state === 'running' || app.state === 'starting')} openExternal={openExternal} onStop={id => act(() => api.stop(id))} />}
        {view === 'drafts' && <DraftsView apps={apps.filter(app => app.madeBy === 'agent')} />}
        {view === 'updates' && <UpdatesView apps={apps.filter(app => app.update !== undefined)} onUpdate={id => act(() => api.update(id))} />}
        {view === 'store' && <StoreView api={api} state={state} openExternal={openExternal} onCreate={async (request) => { const refused = await create(request); if (refused === undefined) setView('apps'); return refused }} />}
        {view === 'plugins' && <PluginStoreView api={api} apps={apps} onStart={id => act(() => api.start(id))} openExternal={openExternal} />}
        {view === 'cloud' && <Empty title="On WebBoxes.ai" text="Put an app online at <name>.webboxes.ai: Share it to GitHub as Public (its card, Share), then press Deploy to WebBoxes.ai on its card. WebBoxes.ai opens with the app filled in: sign in, press Create, then Publish." />}
        {view === 'health' && <HealthView api={api} />}
        {view === 'settings' && <SettingsView api={api} appsFolder={state?.appsFolder ?? ''} skin={skin} onSkin={(next) => { setSkin(next); saveSkin(next) }} />}
      </main>
    </div>
  )
}

/** The job banner's head for each kind of job, running, done and failed. */
const JOB_HEADS: Readonly<Record<NonNullable<StateResponse['job']>['kind'], { doing: string, done: string, failed: string }>> = {
  make: { doing: 'Making {name}', done: '{name} is made', failed: '{name} could not be made' },
  update: { doing: 'Updating {name}', done: '{name} is updated', failed: '{name} could not be updated' },
  build: { doing: 'Building an installer of {name}', done: 'The installer of {name} is built', failed: 'The installer of {name} could not be built' },
  release: { doing: 'Sharing {name} with your team', done: '{name} is shared with your team', failed: '{name} could not be shared with your team' },
}

function JobBanner({ job, openExternal }: { job: NonNullable<StateResponse['job']>, openExternal?: (url: string) => void }): ReactNode {
  const heads = JOB_HEADS[job.kind]
  const named = (text: string): string => text.replace('{name}', job.name)
  const head = job.status === 'running' ? `${named(heads.doing)} · ${elapsed(job.since)}` : named(job.status === 'done' ? heads.done : heads.failed)
  return (
    <div className="acrylHomeJob" role="status">
      <b>{head}</b>{'\n'}<span className="acrylHomeMeta">{job.line}</span>{'\n'}{job.status === 'failed' ? null : job.step}
      {job.message === undefined ? null : `\n${job.message}`}
      {job.installer === undefined ? null : <>{'\n'}<span className="acrylHomeMeta" title="The installer file">{job.installer.file}</span></>}
      {job.link === undefined ? null : <>{'\n'}<span className="acrylHomeMeta" title="The link to send">{job.link}</span>{' '}<button type="button" className="acrylHomeBtn" data-small onClick={() => { if (job.link !== undefined) openExternal?.(job.link) }}>Open</button></>}
      {job.status === 'running' ? <pre className="acrylHomeLog">{job.output === '' ? 'Waiting for its first output...' : job.output}</pre> : null}
    </div>
  )
}

/** This app's own update: a newer release with its button, the update as it runs, then "open it again", or why it did not finish. */
function SelfBanner({ self, onUpdate }: { self: NonNullable<StateResponse['self']>, onUpdate: () => void }): ReactNode {
  const head = self.status === 'available' ? `${self.name} ${self.update} is out` : self.status === 'updating' ? `Updating ${self.name} to ${self.update}${self.since === undefined ? '' : ` · ${elapsed(self.since)}`}` : self.status === 'done' ? `${self.name} is updated to ${self.update}` : `${self.name} could not be updated to ${self.update}`
  const text = self.status === 'available' ? `You have ${self.version}. Updating brings the new release in and keeps any change you made (a git merge), then installs its packages.`
    : self.status === 'updating' ? 'Getting the release, merging it in, then npm install. The screen may reload while it works; that is expected.'
      : self.status === 'done' ? `Quit ${self.name} and open it again to finish: the window and its packages load once, when it opens.`
        : 'Nothing was lost: what the copy had stays. The last lines it printed:'
  return (
    <div className="acrylHomeJob" role="status" aria-label={`${self.name} update`}>
      <b>{head}</b>{'\n'}{text}
      {self.output === undefined || self.output === '' ? null : <pre className="acrylHomeLog">{self.output}</pre>}
      {self.status === 'available' || self.status === 'failed' ? <>{'\n'}<button type="button" className="acrylHomeBtn" data-small data-primary onClick={onUpdate}>{self.status === 'failed' ? 'Try again' : `Update to ${self.update}`}</button></> : null}
    </div>
  )
}

/** "42s" or "2m 05s" since a moment; the screen re-renders on every state poll, so it counts up. */
function elapsed(since: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - since) / 1000))
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`
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
  readonly onCreate: (request: NewAppRequest) => Promise<string | undefined>
  readonly onStart: (id: string) => Promise<boolean>
  readonly onUpdate: (id: string) => Promise<boolean>
  /** Build an installer of the app for this computer (spec 052 T021). */
  readonly onBuild?: (id: string) => Promise<boolean>
  /** Share with team (spec 052 T061). */
  readonly onTeamRelease?: (id: string) => Promise<boolean>
  readonly onStop: (id: string) => Promise<boolean>
  readonly onRemove: (id: string) => Promise<boolean>
  readonly onApplications: (id: string, on: boolean) => Promise<boolean>
  readonly openExternal: (url: string) => void
  /** Leave this screen for the coding workspace underneath it (ACRYL ADE is the agentic development environment, in this same window). */
  readonly onOpenCode: () => void
  readonly adeUnderneath: boolean
  /** Start ACRYL ADE as its own app, in a window or the browser (made the first time). */
  readonly onOpenAde: (surface: 'web' | 'desktop') => void
}

function AppsView(props: AppsViewProps): ReactNode {
  const shown = visibleApps(props.apps, props.search, props.surface)
  const { current } = props
  // ACRYL ADE is always on this machine and always a Desktop app: it answers the Desktop filter and the words it is named by.
  const showCode = (props.surface === 'all' || props.surface === 'desktop' || (!props.adeUnderneath && props.surface === 'web')) && 'acryl ade agentic development environment code ide'.includes(props.search.trim().toLowerCase())
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
              <div className="acrylHomeIcon" style={{ background: '#0f766e' }}>A</div>
              <div style={{ minWidth: 0 }}><div className="acrylHomeName">ACRYL ADE</div><div className="acrylHomeMeta">{props.adeUnderneath ? 'the agentic development environment, in this window' : 'the agentic development environment'}</div></div>
            </div>
            <div className="acrylHomeRow"><SurfaceChip surface="desktop" />{props.adeUnderneath ? null : <SurfaceChip surface="web" />}</div>
            {props.adeUnderneath
              ? <div className="acrylHomeRow"><button type="button" className="acrylHomeBtn" data-primary onClick={props.onOpenCode}>Open ACRYL ADE</button></div>
              : <div className="acrylHomeRow"><button type="button" className="acrylHomeBtn" data-primary onClick={() => { props.onOpenAde('desktop') }}>Open in a window</button><button type="button" className="acrylHomeBtn" onClick={() => { props.onOpenAde('web') }}>Open in the browser</button></div>}
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
      {current === undefined ? null : <Detail api={props.api} app={current} onStart={props.onStart} onUpdate={props.onUpdate} onBuild={props.onBuild} onTeamRelease={props.onTeamRelease} onStop={props.onStop} onRemove={props.onRemove} onApplications={props.onApplications} openExternal={props.openExternal} />}
    </div>
  )
}

function Detail({ api, app, onStart, onUpdate, onBuild, onTeamRelease, onStop, onRemove, onApplications, openExternal }: { api: LauncherApi, app: AppView, onStart: (id: string) => Promise<boolean>, onUpdate: (id: string) => Promise<boolean>, onBuild?: ((id: string) => Promise<boolean>) | undefined, onTeamRelease?: ((id: string) => Promise<boolean>) | undefined, onStop: (id: string) => Promise<boolean>, onRemove: (id: string) => Promise<boolean>, onApplications: (id: string, on: boolean) => Promise<boolean>, openExternal: (url: string) => void }): ReactNode {
  const running = app.state === 'running' || app.state === 'starting'
  const [sharing, setSharing] = useState(false)
  // Another app's detail starts with its share closed.
  useEffect(() => { setSharing(false) }, [app.id])
  return (
    <div className="acrylHomePanel" aria-live="polite">
      <div className="acrylHomePanelTop">
        <h3>{app.name}</h3>
        <div className="acrylHomeActs">
          {running
            ? <><button type="button" className="acrylHomeBtn" data-primary={app.surface === 'desktop' ? undefined : ''} disabled={app.address === undefined} onClick={() => { if (app.address !== undefined) openExternal(app.address) }}>Open in the browser</button><button type="button" className="acrylHomeBtn" onClick={() => { void onStop(app.id) }}>Stop</button></>
            : <button type="button" className="acrylHomeBtn" data-primary disabled={app.state === 'missing'} onClick={() => { void onStart(app.id) }}>Start</button>}
          {app.update === undefined ? null : <button type="button" className="acrylHomeBtn" data-primary title={`${app.blend} ${app.update} is out: bring it into this app, keeping your changes (a git merge), then npm install`} onClick={() => { void onUpdate(app.id) }}>Update to {app.update}</button>}
          <button type="button" className="acrylHomeBtn" disabled={app.state === 'missing'} aria-expanded={sharing} title="Every way to share or move this app: save it to GitHub, build an installer, deploy it to WebBoxes.ai, publish a plugin" onClick={() => { setSharing(open => !open) }}>Share</button>
          <button type="button" className="acrylHomeBtn" disabled={app.state === 'missing'} title={app.inApplications === true ? 'Takes the launcher out of your Applications (Spotlight, the Start menu, the app menu); the app itself stays' : 'Puts a launcher for this app where your computer looks for apps (Spotlight, the Start menu, the app menu)'}
            onClick={() => { void onApplications(app.id, app.inApplications !== true) }}>{app.inApplications === true ? 'Remove from Applications' : 'Add to Applications'}</button>
          <button type="button" className="acrylHomeBtn" disabled title="coming">Open folder</button>
          <button type="button" className="acrylHomeBtn" onClick={() => { void onRemove(app.id) }} title="Takes it off this list; the folder stays">Remove from list</button>
        </div>
      </div>
      <dl className="acrylHomeKv">
        <dt>Blend</dt><dd>{app.blend === '' ? 'none named' : `${app.blend}${app.version === undefined ? '' : ` ${app.version}`}${app.update === undefined ? '' : ` (${app.update} is out)`}`}</dd>
        <dt>Surface</dt><dd>{SURFACE_LABEL[app.surface]}</dd>
        <dt>Folder</dt><dd>{app.path}</dd>
        <dt>Made by</dt><dd>{app.madeBy === 'agent' ? 'an agent' : 'you'}</dd>
        <dt>Address</dt><dd>{app.address === undefined ? (app.state === 'starting' ? 'starting...' : 'not running') : <a href={app.address} title="The address with its access token" onClick={(event) => { event.preventDefault(); if (app.address !== undefined) openExternal(app.address) }}>{app.address}</a>}</dd>
        <dt>Runs</dt><dd>{runsLine(app)}</dd>
      </dl>
      {app.state === 'starting' ? <><p className="acrylHomeNote" role="status">Starting {app.name}: {app.output === undefined ? 'waiting for its first output.' : 'what it prints, live:'}</p>{app.output === undefined ? null : <pre className="acrylHomeLog">{app.output}</pre>}</> : null}
      {sharing ? <SharePanel key={app.id} api={api} app={app} onBuild={onBuild} onTeamRelease={onTeamRelease} onClose={() => { setSharing(false) }} openExternal={openExternal} /> : null}
      {running ? <PluginsPanel api={api} app={app} openExternal={openExternal} /> : <p className="acrylHomeNote">Start the app to pull plugins into it and share the ones made in it.</p>}
      {app.failure === undefined ? null : <p className="acrylHomeNote" data-error>It stopped on its own:{'\n'}{app.failure}</p>}
    </div>
  )
}

/** Where a remote lives on the web, for a person to read: `https://github.com/me/shop.git` is `github.com/me/shop`. */
const remoteLabel = (remote: string): string => remote.replace(/^https?:\/\//u, '').replace(/\.git$/u, '')

/**
 * The GitHub connection sharing and publishing need: GitHub's device sign-in (a code the person types at github.com/login/device), so no terminal
 * login is asked of anyone. Connected, it says who; apps started from then on get the connection.
 */
function GithubConnect({ api, openExternal }: { api: LauncherApi, openExternal: (url: string) => void }): ReactNode {
  const [github, setGithub] = useState<{ available: boolean, login: string | null, workflow?: boolean } | undefined>(undefined)
  const [code, setCode] = useState<{ userCode: string, verificationUri: string, interval: number } | undefined>(undefined)
  const [note, setNote] = useState<string | undefined>(undefined)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { void api.github().then(setGithub, (cause: unknown) => { setNote(message(cause)) }) }, [api])
  // The code is what the person comes back for from GitHub's page: keep it in view.
  useEffect(() => { if (code !== undefined) box.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }) }, [code])
  useEffect(() => {
    if (code === undefined) return undefined
    let stop = false
    let wait = code.interval
    const tick = (): void => {
      if (stop) return
      void api.githubPoll().then((answer) => {
        if (stop) return
        if (answer.state === 'connected') { setCode(undefined); setGithub({ available: true, login: answer.login }); return }
        if (answer.state === 'failed') { setCode(undefined); setNote(answer.reason); return }
        if (answer.interval !== undefined) wait = answer.interval
        timer = setTimeout(tick, wait * 1000)
      }, () => { if (!stop) timer = setTimeout(tick, wait * 1000) })
    }
    let timer = setTimeout(tick, wait * 1000)
    return () => { stop = true; clearTimeout(timer) }
  }, [api, code])
  if (github === undefined || !github.available) return note === undefined ? null : <p className="acrylHomeNote" data-error role="alert">{note}</p>
  if (github.login !== null) {
    return (
      <p className="acrylHomeNote" role="status">GitHub: signed in as <span className="acrylHomeMeta">{github.login === '' ? 'your account' : github.login}</span>.{' '}
        <button type="button" className="acrylHomeBtn" data-small onClick={() => { void api.githubDisconnect().then(setGithub) }}>Disconnect</button>
        {github.workflow === false ? <>{'\n'}Share with team needs one more GitHub permission (to build the installers on GitHub): Disconnect, then connect again.</> : null}
      </p>
    )
  }
  return (
    <div className="acrylHomeNote" role="group" aria-label="Connect GitHub" ref={box}>
      {code === undefined ? (
        <>
          <p>Sharing sends the app to your own GitHub account. Connect it once on this computer.</p>
          <button type="button" className="acrylHomeBtn" data-primary onClick={() => {
            setNote(undefined)
            void api.githubStart().then((started) => { setCode(started); openExternal(started.verificationUri) }, (cause: unknown) => { setNote(message(cause)) })
          }}>Connect GitHub</button>
        </>
      ) : (
        <>
          <p>On the GitHub page that just opened, enter this code and approve ACRYL Control Center:</p>
          <p className="acrylHomeName" aria-label="GitHub code" style={{ fontSize: '1.6em', letterSpacing: '0.12em' }}>{code.userCode}</p>
          <p>The page did not open? Go to <a href={code.verificationUri} onClick={(event) => { event.preventDefault(); openExternal(code.verificationUri) }}>{code.verificationUri}</a>. Waiting for your approval...</p>
        </>
      )}
      {note === undefined ? null : <p className="acrylHomeNote" data-error role="alert">{note}</p>}
    </div>
  )
}

/**
 * The Share place of an app (spec 052 T060): every way to share or move it, gathered, each the flow it was before. Save to GitHub (the app's own plan,
 * then the person's yes), Build installer (T021), Deploy to WebBoxes.ai (from its GitHub repository), and publishing a plugin (the running app's Plugins).
 * The app need not be running, except to publish a plugin.
 */
function SharePanel({ api, app, onBuild, onTeamRelease, onClose, openExternal }: { api: LauncherApi, app: AppView, onBuild?: ((id: string) => Promise<boolean>) | undefined, onTeamRelease?: ((id: string) => Promise<boolean>) | undefined, onClose: () => void, openExternal: (url: string) => void }): ReactNode {
  const [owner, setOwner] = useState('')
  const [plan, setPlan] = useState<AppSharePlanView | undefined>(undefined)
  const [done, setDone] = useState<AppShareResponse | undefined>(undefined)
  const [note, setNote] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const run = async (work: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setNote(undefined)
    try { await work() } catch (cause) { setNote(message(cause)) } finally { setBusy(false) }
  }
  const [visibility, setVisibility] = useState<'private' | 'public'>('private')
  const panel = useRef<HTMLDivElement>(null)
  // The panel opens below the app's details, often under the fold: bring it into view.
  useEffect(() => { panel.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }) }, [])
  const owner_ = owner.trim() === '' ? {} : { owner: owner.trim() }
  return (
    <div className="acrylHomePanel" role="group" aria-label={`Share ${app.name}`} ref={panel}>
      <div className="acrylHomePanelTop"><h3>Share {app.name}</h3><button type="button" className="acrylHomeBtn" data-small onClick={onClose}>Close</button></div>
      <h4 className="acrylHomeShareStep">1. Save to GitHub</h4>
      <p className="acrylHomeNote">A repository of its own, with every saved version: the way to keep it, move it to another computer, or work on it with others.</p>
      <GithubConnect api={api} openExternal={openExternal} />
      {done !== undefined ? (
        <p className="acrylHomeNote" role="status">Shared to <span className="acrylHomeMeta">{remoteLabel(done.remote)}</span>{done.created ? ' (a new repository)' : ''}. Someone you give access makes their own copy with <span className="acrylHomeMeta">git clone {done.remote}</span></p>
      ) : plan === undefined ? (
        <form className="acrylHomeRow" onSubmit={(event) => {
          event.preventDefault()
          void run(async () => { setPlan(await api.sharePlan({ id: app.id, ...owner_, visibility })) })
        }}>
          <input className="acrylHomeInput" style={{ flex: '1 1 240px' }} value={owner} placeholder="GitHub account (blank: yours)" aria-label="GitHub account" onChange={(event) => { setOwner(event.target.value) }} />
          <select className="acrylHomeInput" value={visibility} aria-label="Who can see it" onChange={(event) => { setVisibility(event.target.value === 'public' ? 'public' : 'private') }}>
            <option value="private">Private: only you and people you invite</option>
            <option value="public">Public: anyone, listed as Community</option>
          </select>
          <button type="submit" className="acrylHomeBtn" data-primary disabled={busy}>Review what would be sent</button>
        </form>
      ) : (
        <>
          <dl className="acrylHomeKv">
            <dt>Repository</dt><dd>{remoteLabel(plan.create ? `github.com/${plan.repository}` : plan.repository)}{plan.create ? ' (a new repository)' : ''}</dd>
            <dt>Who can see it</dt><dd>{plan.visibility === 'private' ? 'Only you and people you invite (private)' : 'Anyone (public)'}</dd>
            <dt>What is sent</dt><dd>{plan.changes === 0 ? 'The versions saved so far' : `${String(plan.changes)} changed ${plan.changes === 1 ? 'file is' : 'files are'} saved first, then every saved version`}</dd>
          </dl>
          <p className="acrylHomeNote">Nothing has been sent. It is sent only when you say yes.</p>
          <div className="acrylHomeActs">
            <button type="button" className="acrylHomeBtn" data-primary disabled={busy} onClick={() => { void run(async () => { setDone(await api.share({ id: app.id, ...owner_, plan })) }) }}>Yes, share {app.name}</button>
            <button type="button" className="acrylHomeBtn" disabled={busy} onClick={() => { setPlan(undefined) }}>Not yet</button>
          </div>
        </>
      )}
      {note === undefined ? null : <p className="acrylHomeNote" data-error role="alert">{note}</p>}
      <h4 className="acrylHomeShareStep">2. Build installer</h4>
      <p className="acrylHomeNote">An installer of {app.name} for this computer: a DMG on macOS, an .exe on Windows, a .deb on Linux. It carries everything the app needs, so whoever gets it needs no Node, git or ACRYL. It takes 5 to 15 minutes; the progress shows at the top.</p>
      <div className="acrylHomeActs">
        <button type="button" className="acrylHomeBtn" data-primary disabled={app.state === 'missing' || onBuild === undefined} onClick={() => { void onBuild?.(app.id) }}>Build installer</button>
        <button type="button" className="acrylHomeBtn" disabled={app.state === 'missing' || app.github === undefined || onTeamRelease === undefined}
          title={app.github === undefined ? 'Save it to GitHub first (step 1): GitHub builds the installers in its repository' : 'GitHub builds the installers for macOS, Windows and Linux and puts them on one page: the link to send'}
          onClick={() => { void onTeamRelease?.(app.id) }}>Share with team</button>
      </div>
      <p className="acrylHomeNote">Share with team: GitHub builds the installers for macOS, Windows and Linux (about 20 minutes) and puts them on one page of the app's repository, the link to send. {app.github === undefined ? 'It needs the app on GitHub first (step 1).' : ''}</p>
      <h4 className="acrylHomeShareStep">3. Deploy to WebBoxes.ai</h4>
      <p className="acrylHomeNote">{app.github === undefined ? 'Runs the app in the cloud, at an address anyone can open. It deploys from the app\'s GitHub repository: save it to GitHub (public) first.' : `Runs the app in the cloud from ${app.github}, at an address anyone can open.`}</p>
      <div className="acrylHomeActs"><button type="button" className="acrylHomeBtn" disabled={app.github === undefined} onClick={() => { if (app.github !== undefined) openExternal(webboxesDeployUrl(app.github, app.name)) }}>Deploy to WebBoxes.ai</button></div>
      <h4 className="acrylHomeShareStep">4. Publish a plugin</h4>
      <p className="acrylHomeNote">{app.state === 'running' ? 'A plugin made in this app goes to the plugin registry from its Plugins, below: Share plugin shows exactly what would be published first.' : `Start ${app.name}: its Plugins, below, then publish a plugin made in it to the plugin registry.`}</p>
    </div>
  )
}

/** The plugins of a running app: what it has, pulling one from a registry, and sharing one made here (the app's plan, then the person's yes). */
function PluginsPanel({ api, app, openExternal }: { api: LauncherApi, app: AppView, openExternal: (url: string) => void }): ReactNode {
  const [plugins, setPlugins] = useState<readonly PluginView[] | undefined>(undefined)
  const [source, setSource] = useState('')
  const [sharing, setSharing] = useState<string | undefined>(undefined)
  const [owner, setOwner] = useState('')
  const [plan, setPlan] = useState<PublishPlanView | undefined>(undefined)
  const [done, setDone] = useState<PublishResponse | undefined>(undefined)
  const [note, setNote] = useState<{ text: string, error: boolean } | undefined>(undefined)
  const [doing, setDoing] = useState<string | undefined>(undefined)
  const busy = doing !== undefined
  const ready = app.state === 'running'

  /** `what` is said while it runs (a pull or a publish takes 5 to 20 seconds), so the screen never just sits there. */
  const run = async (what: string, work: () => Promise<void>): Promise<void> => {
    setDoing(what)
    setNote(undefined)
    try { await work() } catch (cause) { setNote({ text: message(cause), error: true }) } finally { setDoing(undefined) }
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
        void run(`Pulling ${source.trim()}: downloading it, checking its digest and installing it into ${app.name}...`, async () => {
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
          <GithubConnect api={api} openExternal={openExternal} />
          {done !== undefined ? (
            <>
              <p className="acrylHomeNote">Published: <span className="acrylHomeMeta">{done.releaseUrl}</span></p>
              <p className="acrylHomeNote">A friend gets exactly these bytes with <span className="acrylHomeMeta">{done.pullLine}</span></p>
            </>
          ) : plan === undefined ? (
            <form className="acrylHomeRow" onSubmit={(event) => {
              event.preventDefault()
              void run(`Reading what publishing ${sharing} would send...`, async () => { setPlan(await api.publishPlan({ id: app.id, plugin: sharing, ...owner_ })) })
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
                <button type="button" className="acrylHomeBtn" data-primary disabled={busy} onClick={() => { void run(`Publishing ${plan.owner}/${plan.repo} ${plan.version}: ${plan.createsRepository ? 'making the repository, ' : ''}pushing the files and making the release...`, async () => { setDone(await api.publish({ id: app.id, plugin: sharing, ...owner_, plan })) }) }}>Yes, publish {plan.owner}/{plan.repo}</button>
                <button type="button" className="acrylHomeBtn" disabled={busy} onClick={() => { setPlan(undefined) }}>Not yet</button>
              </div>
            </>
          )}
        </div>
      )}
      {doing === undefined ? null : <p className="acrylHomeNote" role="status">{doing}</p>}
      {note === undefined ? null : <p className="acrylHomeNote" data-error={note.error ? '' : undefined} role={note.error ? 'alert' : 'status'}>{note.text}</p>}
    </div>
  )
}

function NewAppForm({ state, blend, onCreate, onCancel }: { state: StateResponse, blend?: BlendView, onCreate: (request: NewAppRequest) => Promise<string | undefined>, onCancel: () => void }): ReactNode {
  const [where, setWhere] = useState(state.appsFolder)
  // What the person types; the folder (and the app's id) is made from it.
  const [name, setName] = useState(blend === undefined ? '' : blendAppName(blend.id))
  const folder = folderName(name)
  const [refused, setRefused] = useState<string | undefined>(undefined)
  const [starter, setStarter] = useState(state.starters[0]?.value ?? 'blank')
  const [surface, setSurface] = useState<Surface>('web')
  const [busy, setBusy] = useState(false)
  const line = `cd ${where} && acryl new ${folder === '' ? '<name>' : folder} ${blend === undefined ? starter : `--from ${blend.source ?? blend.id}`}`
  return (
    <form className="acrylHomePanel acrylHomeForm" onSubmit={(event) => { event.preventDefault(); setRefused(undefined); setBusy(true); void onCreate({ where, name: folder, surface, ...blend === undefined ? { starter } : { blend: blend.source ?? blend.id } }).then(setRefused).finally(() => { setBusy(false) }) }}>
      <div className="acrylHomePanelTop"><h3>{blend === undefined ? 'New app' : `New app from ${blend.name}`}</h3></div>
      <label className="acrylHomeField"><span>Where does it go?</span><input className="acrylHomeInput" data-mono value={where} onChange={(event) => { setWhere(event.target.value) }} aria-label="Where does it go" /></label>
      <label className="acrylHomeField"><span>Name</span><input className="acrylHomeInput" value={name} placeholder="My app" autoFocus onChange={(event) => { setName(event.target.value); setRefused(undefined) }} aria-label="Name" /></label>
      <p className="acrylHomeNote">{folder === '' ? 'Type a name with at least one letter.' : <>Folder <span className="acrylHomeMeta">{`${where.replace(/[\\/]+$/u, '')}/${folder}`}</span></>}</p>
      {blend !== undefined && blend.origin === 'community' ? <p className="acrylHomeNote" data-warn role="note">A Community Blend: released by someone outside the ACRYL project, from {blend.source}. Its code is not reviewed; make it only if you trust who released it.</p> : null}
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
      <div className="acrylHomeActs"><button type="submit" className="acrylHomeBtn" data-primary disabled={busy || folder === ''}>{busy ? 'Making it...' : 'Make it'}</button><button type="button" className="acrylHomeBtn" disabled={busy} onClick={onCancel}>Cancel</button></div>
      {busy ? <p className="acrylHomeNote" role="status">Making {folder} in {where}: copying {blend === undefined ? 'the starter' : blend.name} and installing its packages. This can take a minute or two.</p> : null}
      {refused === undefined ? null : <p className="acrylHomeNote" data-error role="alert">Not made: {refused}</p>}
    </form>
  )
}

/**
 * The public registry's Blends, read when the store opens: browsed by the store's categories and subcategories, by who released them and by search; a
 * card opens the Blend's page (its picture, what it is, where it sits), and "Make an app" opens the New app form for it.
 */
function StoreView({ api, state, onCreate, openExternal }: { api: LauncherApi, state: StateResponse | undefined, onCreate: (request: NewAppRequest) => Promise<string | undefined>, openExternal: (url: string) => void }): ReactNode {
  const [blends, setBlends] = useState<readonly BlendView[] | undefined>(undefined)
  const [failed, setFailed] = useState<string | undefined>(undefined)
  const [search, setSearch] = useState('')
  const [origin, setOrigin] = useState<'all' | BlendView['origin']>('all')
  const [category, setCategory] = useState<string | undefined>(undefined)
  const [subcategory, setSubcategory] = useState<string | undefined>(undefined)
  const [viewing, setViewing] = useState<BlendView | undefined>(undefined)
  const [chosen, setChosen] = useState<BlendView | undefined>(undefined)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let live = true
    setFailed(undefined)
    api.blends().then((list) => { if (live) setBlends(list) }, (cause: unknown) => { if (live) setFailed(message(cause)) })
    return () => { live = false }
  }, [api, attempt])
  const needle = search.trim().toLowerCase()
  const byOrigin = (blends ?? []).filter(blend => origin === 'all' || blend.origin === origin)
  const categories = storeCategories(byOrigin)
  const current = categories.find(entry => entry.name === category)
  const shown = byOrigin.filter(blend => (category === undefined || blend.place?.category === category) && (subcategory === undefined || blend.place?.subcategory === subcategory) && (needle === '' || `${blend.name} ${blend.id} ${blend.category} ${blend.description}`.toLowerCase().includes(needle)))
  const count = (which: BlendView['origin']): number => (blends ?? []).filter(blend => blend.origin === which).length
  const choose = (name: string | undefined): void => { setCategory(name); setSubcategory(undefined) }
  const makeForm = chosen !== undefined && state !== undefined ? <NewAppForm key={chosen.id} state={state} blend={chosen} onCreate={onCreate} onCancel={() => { setChosen(undefined) }} /> : null
  if (viewing !== undefined) return (
    <section className="acrylHomeForm">
      <div className="acrylHomeRow"><button type="button" className="acrylHomeBtn" data-small onClick={() => { setViewing(undefined); setChosen(undefined) }}>‹ All Blends</button>{viewing.place === undefined ? null : <span className="acrylHomeMeta">{viewing.place.category}{viewing.place.subcategory === '' ? '' : ` › ${viewing.place.subcategory}`}</span>}</div>
      <BlendPage blend={viewing} />
      {makeForm}
      <div className="acrylHomeActs">
        <button type="button" className="acrylHomeBtn" data-primary disabled={state === undefined || chosen !== undefined} onClick={() => { setChosen(viewing) }}>Make an app</button>
        {viewing.page === undefined ? null : <button type="button" className="acrylHomeBtn" onClick={() => { if (viewing.page !== undefined) openExternal(viewing.page) }}>Open its store page</button>}
        <button type="button" className="acrylHomeBtn" title={`Opens WebBoxes.ai on ${viewing.name}: sign in, press Create, then Publish`} onClick={() => { openExternal(webboxesDeployBlendUrl(viewing)) }}>Deploy to WebBoxes.ai</button>
      </div>
    </section>
  )
  return (
    <section className="acrylHomeForm">
      <h3 style={{ margin: 0 }}>Blends store</h3>
      <p className="acrylHomeNote">Ready-made apps from the public registry (acrylblends.github.io/blends). Open one to see what it is; making one is the same as <span className="acrylHomeMeta">acryl new &lt;name&gt; --from &lt;id&gt;</span>.</p>
      {makeForm}
      <input className="acrylHomeSearch" type="search" value={search} placeholder="Search Blends..." aria-label="Search Blends" onChange={(event) => { setSearch(event.target.value) }} />
      <div className="acrylHomeRow" role="group" aria-label="Who released it">
        <button type="button" className="acrylHomeChip" aria-pressed={origin === 'all'} onClick={() => { setOrigin('all') }}>All ({(blends ?? []).length})</button>
        <button type="button" className="acrylHomeChip" aria-pressed={origin === 'official'} title="Released by the ACRYL project" onClick={() => { setOrigin('official') }}>Official ({count('official')})</button>
        <button type="button" className="acrylHomeChip" aria-pressed={origin === 'community'} title="Released by people outside the ACRYL project; their code is not reviewed" onClick={() => { setOrigin('community') }}>Community ({count('community')})</button>
      </div>
      <div className="acrylHomeStore">
        {categories.length === 0 ? <div /> : (
          <div className="acrylHomeStoreCats" role="group" aria-label="Categories">
            <button type="button" className="acrylHomeNavItem" aria-pressed={category === undefined} aria-label={`All categories (${String(byOrigin.length)})`} onClick={() => { choose(undefined) }}><span>All categories</span><span className="acrylHomeCount">{byOrigin.length}</span></button>
            {categories.map(entry => <button key={entry.name} type="button" className="acrylHomeNavItem" aria-pressed={category === entry.name} aria-label={`${entry.name} (${String(entry.count)})`} onClick={() => { choose(entry.name) }}><span>{entry.name}</span><span className="acrylHomeCount">{entry.count}</span></button>)}
          </div>
        )}
        <div className="acrylHomeStoreMain">
          {current === undefined || current.subs.length === 0 ? null : (
            <div className="acrylHomeRow" role="group" aria-label={`Subcategories of ${current.name}`}>
              <button type="button" className="acrylHomeChip" aria-pressed={subcategory === undefined} onClick={() => { setSubcategory(undefined) }}>All of {current.name}</button>
              {current.subs.map(entry => <button key={entry.name} type="button" className="acrylHomeChip" aria-pressed={subcategory === entry.name} onClick={() => { setSubcategory(entry.name) }}>{entry.name} ({entry.count})</button>)}
            </div>
          )}
          {failed !== undefined ? <p className="acrylHomeNote" data-error role="alert">{failed} <button type="button" className="acrylHomeBtn" data-small onClick={() => { setAttempt(attempt + 1) }}>Try again</button></p> : null}
          {blends === undefined && failed === undefined ? <p className="acrylHomeNote">Reading the registry...</p> : null}
          {blends !== undefined && shown.length === 0 ? <p className="acrylHomeNote">No Blend matches.</p> : null}
          <div className="acrylHomeCards">
            {shown.map(blend => (
              <div className="acrylHomeApp" key={blend.id}>
                <button type="button" className="acrylHomeHead acrylHomeHeadLink" title={`Open ${blend.name}: its picture and what it is`} aria-label={`Open ${blend.name}`} onClick={() => { setViewing(blend); setChosen(undefined) }}>
                  <div className="acrylHomeIcon" style={{ background: iconColor(blend.id) }}>{initial(blend.name)}</div>
                  <div style={{ minWidth: 0 }}><div className="acrylHomeName">{blend.name}</div><div className="acrylHomeMeta">{blend.id}</div></div>
                </button>
                <p className="acrylHomeDesc">{blend.description}</p>
                <OriginPills blend={blend} />
                <div className="acrylHomeCardFoot" data-wrap="">
                  <button type="button" className="acrylHomeBtn" data-small onClick={() => { setViewing(blend); setChosen(undefined) }}>View</button>
                  <button type="button" className="acrylHomeBtn" data-small title={`Opens WebBoxes.ai on ${blend.name}: sign in, press Create, then Publish`} onClick={() => { openExternal(webboxesDeployBlendUrl(blend)) }}>Deploy to WebBoxes.ai</button>
                  <button type="button" className="acrylHomeBtn" data-small data-primary disabled={state === undefined} onClick={() => { setChosen(blend) }}>Make an app</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/** Who released a Blend, where the store files it and its version, as the card and the Blend's page show them. */
function OriginPills({ blend }: { blend: BlendView }): ReactNode {
  return (
    <div className="acrylHomeRow">{blend.origin === 'official'
      ? <span className="acrylHomePill" title="Released by the ACRYL project">Official</span>
      : <span className="acrylHomePill" title="Released by someone outside the ACRYL project; its code is not reviewed">Community</span>}{blend.publisher === undefined ? null : <span className="acrylHomeMeta">by @{blend.publisher}</span>}{blend.category === '' ? null : <span className="acrylHomePill" title={blend.category}>{blend.category}</span>}{blend.version === '' ? null : <span className="acrylHomeMeta">{blend.version}</span>}</div>
  )
}

/** A Blend's own page in the store: its first page's picture (when it has one), its name, who released it, where it sits, and what it is. */
function BlendPage({ blend }: { blend: BlendView }): ReactNode {
  const [pictured, setPictured] = useState(true)
  return (
    <article className="acrylHomeForm" aria-label={blend.name}>
      <div className="acrylHomeHead">
        <div className="acrylHomeIcon" style={{ background: iconColor(blend.id) }}>{initial(blend.name)}</div>
        <div style={{ minWidth: 0 }}><h3 style={{ margin: 0 }}>{blend.name}</h3><div className="acrylHomeMeta">{blend.id}{blend.source === undefined ? '' : ` · ${blend.source}`}</div></div>
      </div>
      <OriginPills blend={blend} />
      {blend.screenshot !== undefined && pictured
        ? <img src={blend.screenshot} alt={`${blend.name}, its first page`} loading="lazy" onError={() => { setPictured(false) }} style={{ display: 'block', width: '100%', maxHeight: 420, objectFit: 'cover', objectPosition: 'top', border: '1px solid var(--h-border)', borderRadius: 12 }} />
        : <p className="acrylHomeNote">No picture of this Blend yet.</p>}
      <p className="acrylHomeDesc" style={{ WebkitLineClamp: 'unset', display: 'block' }}>{blend.description}</p>
      {blend.origin === 'community' ? <p className="acrylHomeNote" data-warn role="note">A Community Blend: released by someone outside the ACRYL project. Its code is not reviewed; make it only if you trust who released it.</p> : null}
    </article>
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
      <p className="acrylHomeNote">When ACRYL quits, the Web apps it started stop with it. A Desktop app keeps its window open; closing the window stops it.</p>
    </section>
  )
}

function UpdatesView({ apps, onUpdate }: { apps: readonly AppView[], onUpdate: (id: string) => Promise<boolean> }): ReactNode {
  return (
    <section className="acrylHomeForm">
      <h3 style={{ margin: 0 }}>Updates</h3>
      <p className="acrylHomeNote">An app made from a Blend gets that Blend's newer releases from the registry. Updating merges the release into the app and keeps your changes; each step is a version you can go back to. ACRYL Control Center itself updates from its menu: Check for Updates.</p>
      {apps.length === 0 ? <p className="acrylHomeNote">Every app is on the latest release of its Blend.</p> : (
        <div className="acrylHomeList">
          {apps.map(app => <div className="acrylHomeItem" key={app.id}><div className="acrylHomeIcon" style={{ background: iconColor(app.id) }}>{initial(app.name)}</div><div><b>{app.name}</b><small>{app.blend} {app.version} to {app.update}</small></div><button type="button" className="acrylHomeBtn" data-primary onClick={() => { void onUpdate(app.id) }}>Update to {app.update}</button></div>)}
        </div>
      )}
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
