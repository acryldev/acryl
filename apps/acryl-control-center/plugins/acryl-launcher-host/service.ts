/**
 * What the ACRYL screen does, as one service with ports (Clean Architecture: the routes and the Cordis plugin are the edge; this holds the rules).
 * The list is the registry `<home>/apps.json` (`acryl-launcher`, the same file `acryl apps` and the terminal read); what runs is held here, in
 * memory, because the launcher records no port: an app is "running" when this service started it and it has not ended.
 */
import { basename, join } from 'node:path'
import {
  addApp, APP_NAME, appNameProblem, APP_MARKER, blendOf, blendVersionOf, clearGithub, githubOf, githubClientId, githubEnv, inspectApp, maskKey, modelEnv, pollGithubSignIn,
  readApps, readGithub, readModelKey, removeApp, setBlendVisibility, startGithubSignIn, STARTERS, toolsEnv, whereProblem,
  type AppEntry,
} from '@acryldev/launcher'
import type {
  GithubPollView, GithubStartView, GithubView,
  AppSharePlanRequest, AppSharePlanView, AppShareRequest, AppShareResponse, AppRunState, AppView, BlendView, HealthView, JobView, NewAppRequest, PluginPullResponse, PluginView, PublishPlanRequest, PublishPlanView, PublishRequest, PublishResponse, StateResponse, Surface,
} from './contract.ts'
import { ACCOUNT_NAME, BLEND_ID, BLEND_SOURCE, LICENSE_ID, MAKEABLE_SURFACES, PLUGIN_NAME } from './contract.ts'
import { DoorUnavailable, type Door, type DoorAnswer } from './door.ts'
import { appEnvironment, type Run, type Runner } from './runner.ts'

/** A request the service cannot honour, in a sentence a person can act on. The route answers it as 409. */
export class LauncherRefusal extends Error {}

export interface LauncherPorts {
  /** ACRYL's home (`appInstance.home`): where `apps.json` and `model.json` are. */
  readonly home: string
  /** The folder "+ New app" suggests. */
  readonly appsFolder: string
  readonly runner: Runner
  /** The environment started apps inherit (before the desktop app's own keys are removed). */
  readonly environment: () => Readonly<Record<string, string | undefined>>
  readonly exists: (path: string) => boolean
  readonly makeFolder: (path: string) => void
  /** The Blends in the public registry; rejects (`RegistryUnavailable`) when it cannot be read. */
  readonly blends: () => Promise<readonly BlendView[]>
  /** The running apps' doors: what lists, pulls and publishes their plugins. */
  readonly door: Door
  /**
   * Fetch whatever of Node.js (with npm) and gh this computer lacks into `<home>/tools` (`prepareTools` of @acryldev/launcher); absent, the
   * computer's own tools are used as they are (tests, and a launcher run from a terminal).
   */
  readonly prepareTools?: () => Promise<readonly string[]>
}

/** The address an app prints, with the token it needs: `http://127.0.0.1:3999/?token=...`. */
const ADDRESS = /https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d+[^\s'")\]]*/u
const TAIL_LINES = 12
const BLENDS_FRESH_MS = 60_000
/** The package `acryl new` runs (`distribution/acryl-npm-launcher/forward.js` CREATE_SPEC). */
const CREATE_SPEC = 'create-acrylblends@latest'
/** The command that updates an app from its Blend's newer release (`acrylblends update`, in the acrylblends package). */
const UPDATE_SPEC = 'acrylblends@latest'
/** The app's own share command, from its folder (the `save` plugin of acrylblends). */
const SHARE_COMMAND = join('plugins', 'save', 'share-cli.ts')
/** ACRYL ADE: the Blend and the folder in the home that `acryl ade` makes and opens (`distribution/acryl-npm-launcher/managed.js` MANAGED.ade). */
const ADE_BLEND = 'acryl.ade'
const ADE_FOLDER = 'ade'
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/gu

// A finished last line keeps its newline, so the next chunk starts a line of its own instead of running on ("...needsnpm http fetch").
const tail = (text: string): string => {
  const lines = text.replace(ANSI, '').split(/\r?\n/u).map(line => line.trim()).filter(line => line !== '').slice(-TAIL_LINES).join('\n')
  return lines !== '' && /\n\s*$/u.test(text) ? `${lines}\n` : lines
}

/** The job as this service changes it; `JobView` is what the screen is told. */
interface Job {
  readonly name: string
  readonly kind: JobView['kind']
  readonly line: string
  status: JobView['status']
  step: string
  readonly since: number
  output: string
  message?: string
  /** The process the job is on now: the command that makes the app, then, for an app that arrives without its dependencies, `npm install`. */
  run: Run
}

interface Started {
  readonly run: Run
  address: string | undefined
  output: string
}

export class LauncherService {
  readonly #ports: LauncherPorts
  readonly #started = new Map<string, Started>()
  /** Why an app last ended without being stopped, until it is started again. */
  readonly #failures = new Map<string, string>()
  #job: Job | undefined
  #blends: { at: number, list: readonly BlendView[] } | undefined

  #signIn: { readonly clientId: string, readonly deviceCode: string, readonly until: number } | undefined
  /** Apps just made whose `npm install` is running (`#install`), by id. */
  readonly #installing = new Map<string, Job>()
  /** The tools apps need: being fetched (the first start on a computer without them), ready, or not had (apps then try the computer's own). */
  #tools: { readonly state: 'preparing' } | { readonly state: 'ready' } | { readonly state: 'failed', readonly reason: string } = { state: 'ready' }
  constructor(ports: LauncherPorts) { this.#ports = ports }

  /** Start fetching what this computer lacks of Node.js and gh; apps wait for it (`#toolsReady`). Called once, when the launcher starts. */
  prepareTools(): Promise<void> {
    const prepare = this.#ports.prepareTools
    if (prepare === undefined) return Promise.resolve()
    this.#tools = { state: 'preparing' }
    return prepare().then(
      () => { this.#tools = { state: 'ready' } },
      (cause: unknown) => { this.#tools = { state: 'failed', reason: cause instanceof Error ? cause.message : String(cause) } },
    )
  }

  /** Refuse, in words, to start anything while the tools are still being fetched; a failed fetch lets apps try the computer's own tools. */
  #toolsReady(): void {
    if (this.#tools.state === 'preparing') {
      throw new LauncherRefusal('Getting Node.js and GitHub\'s tool ready for your apps (only on the first start on this computer, about a minute). Try again in a moment.')
    }
  }

  state(): StateResponse {
    // The registry's versions mark the apps with a newer Blend release; a stale list is read again in the background for the next state.
    if (this.#blends === undefined || Date.now() - this.#blends.at >= BLENDS_FRESH_MS) void this.blends().catch(() => undefined)
    const apps = readApps(this.#ports.home).map(entry => this.#view(entry))
    const at = this.#job
    const job = at === undefined ? null : { name: at.name, kind: at.kind, line: at.line, status: at.status, step: at.step, since: at.since, output: at.output.trimEnd(), ...at.message === undefined ? {} : { message: at.message } }
    return { apps, appsFolder: this.#ports.appsFolder, starters: STARTERS, job }
  }

  #view(entry: AppEntry): AppView {
    const started = this.#started.get(entry.id)
    const missing = inspectApp(entry).state === 'missing'
    const installing = this.#installing.get(entry.id)
    const state: AppRunState = missing ? 'missing' : started === undefined ? (installing !== undefined ? 'starting' : 'stopped') : started.address === undefined ? 'starting' : 'running'
    const failure = this.#failures.get(entry.id)
    const blend = entry.blend === '' ? blendOf(entry.path) : entry.blend
    const version = missing ? '' : blendVersionOf(entry.path)
    const latest = this.#blends?.list.find(listed => listed.id === blend)?.version
    const github = missing ? undefined : githubOf(entry.path)
    return {
      id: entry.id, name: basename(entry.path), path: entry.path, blend, madeBy: entry.madeBy, surface: entry.surface, state,
      ...version === '' ? {} : { version },
      ...version !== '' && latest !== undefined && newerVersion(latest, version) ? { update: latest } : {},
      ...started?.address === undefined ? {} : { address: started.address },
      ...started === undefined || started.address !== undefined || started.output === '' ? {} : { output: started.output.trimEnd() },
      ...started === undefined && installing !== undefined && installing.output !== '' ? { output: installing.output.trimEnd() } : {},
      ...failure === undefined || state !== 'stopped' ? {} : { failure },
      ...github === undefined ? {} : { github },
    }
  }

  add(path: string): AppView {
    try {
      return this.#view(addApp(this.#ports.home, { path }).entry)
    } catch (cause) {
      throw new LauncherRefusal(cause instanceof Error ? cause.message : String(cause))
    }
  }

  remove(id: string): void {
    this.stop(id)
    if (!removeApp(this.#ports.home, id)) throw new LauncherRefusal(`there is no app "${id}" in the list`)
  }

  /**
   * Start an app the way the terminal's "Open an app" does, with the saved model key: a Web app with `npm run dev` in its folder (its address opens in the
   * browser), a Desktop app with `npm run desktop`, which starts the same app and opens it in its own window (Electron is fetched the first time).
   */
  start(id: string, surface?: Surface): void {
    this.#toolsReady()
    const entry = readApps(this.#ports.home).find(app => app.id === id)
    if (entry === undefined) throw new LauncherRefusal(`there is no app "${id}" in the list`)
    if (inspectApp(entry).state === 'missing') throw new LauncherRefusal(`the folder ${entry.path} is gone: remove it from the list, or put it back`)
    if (this.#started.has(id)) return
    this.#failures.delete(id)
    // An app whose dependencies are not installed (one pulled from the registry in a terminal, or copied) cannot run: install them first, shown as "starting".
    if (!this.#ports.exists(join(entry.path, 'node_modules'))) { this.#installThenStart(id, entry.path, surface); return }
    const run = this.#ports.runner({ program: 'npm', args: ['run', (surface ?? entry.surface) === 'desktop' ? 'desktop' : 'dev'], cwd: entry.path, env: this.#environment() })
    this.#watch(id, run, undefined)
  }

  #installThenStart(id: string, folder: string, surface: Surface | undefined): void {
    const run = this.#ports.runner({ program: 'npm', args: ['install', '--loglevel', 'http'], cwd: folder, env: this.#environment() })
    const started: Started = { run, address: undefined, output: '' }
    this.#started.set(id, started)
    run.onOutput((text) => { started.output = tail(`${started.output}${text}`) })
    run.onEnd((end) => {
      if (this.#started.get(id) !== started) return
      this.#started.delete(id)
      if (end.notFound) this.#failures.set(id, 'Node.js and npm were not found on this machine. Install Node.js 22.19 or later from nodejs.org, then try again.')
      else if (end.code === 0) { try { this.start(id, surface) } catch (cause) { this.#failures.set(id, cause instanceof Error ? cause.message : String(cause)) } }
      else if (end.code !== null) this.#failures.set(id, started.output === '' ? (end.error ?? 'npm install ended before the app could run.') : started.output.trimEnd())
    })
  }

  /**
   * ACRYL ADE, the way `acryl ade` (`--gui`) opens it: the Blend `acryl.ade` in `<home>/ade`, made from the registry the first time (listed, installed and
   * started as any app made here is), then started in a window or the browser. Already running, it is left as it is.
   */
  openAde(surface: 'web' | 'desktop'): void {
    const folder = join(this.#ports.home, ADE_FOLDER)
    if (!this.#ports.exists(join(folder, APP_MARKER))) { this.create({ name: ADE_FOLDER, where: this.#ports.home, blend: ADE_BLEND, surface }); return }
    this.start(addApp(this.#ports.home, { path: folder, surface }).entry.id, surface)
  }

  stop(id: string): void {
    this.#started.get(id)?.run.stop()
  }

  /**
   * Bring the newer registry release of the app's Blend into it: `acrylblends update` in its folder (a git merge that keeps the person's changes, then npm
   * install). A running app is stopped first and started again after.
   */
  update(id: string): void {
    this.#toolsReady()
    if (this.#job?.status === 'running') throw new LauncherRefusal(`${this.#job.name} is still being worked on: wait for it to finish`)
    const entry = readApps(this.#ports.home).find(app => app.id === id)
    if (entry === undefined) throw new LauncherRefusal(`there is no app "${id}" in the list`)
    const view = this.#view(entry)
    if (view.update === undefined) throw new LauncherRefusal(`${view.name} is on the latest release of ${view.blend}`)
    const restart = this.#started.has(id)
    this.stop(id)
    const run = this.#ports.runner({ program: 'npm', args: ['exec', '--yes', UPDATE_SPEC, '--', 'update'], cwd: entry.path, env: this.#environment() })
    const job: Job = {
      name: view.name, kind: 'update', line: `cd ${entry.path} && npx ${UPDATE_SPEC} update`, status: 'running', run, since: Date.now(), output: '',
      step: `Updating ${view.name} from ${view.blend} ${view.version ?? ''} to ${view.update}: getting the release and merging it in, your changes are kept, then npm install. Next: ${restart ? 'starting it again' : 'done'}.`,
    }
    this.#job = job
    let output = ''
    run.onOutput((text) => { output = tail(`${output}${text}`); job.output = output })
    run.onEnd((end) => {
      if (job.run !== run) return
      if (end.notFound) { job.status = 'failed'; job.message = 'Node.js and npm were not found on this machine. Install Node.js 22.19 or later from nodejs.org, then try again.'; return }
      if (end.code !== 0) { job.status = 'failed'; job.message = output === '' ? (end.error ?? 'The update ended before it was done; the app is unchanged.') : output.trimEnd(); return }
      job.status = 'done'
      job.step = `Updated ${view.name} to ${view.blend} ${view.update}.${restart ? ' Starting it again: its progress shows on its card below.' : ''}`
      job.output = ''
      if (restart) try { this.start(id) } catch (cause) { this.#failures.set(id, cause instanceof Error ? cause.message : String(cause)) }
    })
  }

  stopAll(): void {
    for (const started of this.#started.values()) started.run.stop()
    this.#job?.run.stop()
  }

  /**
   * Make an app: the same `acryl new <name> <starter>` the terminal runs, in the folder the person chose. `acryl new` goes on to install and start the app,
   * so the process it began is the app's running process: when its blend.yaml appears the app is listed and that process is adopted as the app's.
   */
  create(request: NewAppRequest): void {
    this.#toolsReady()
    if (this.#job?.status === 'running') throw new LauncherRefusal(`${this.#job.name} is still being made: wait for it to finish`)
    const problem = whereProblem(request.where) ?? (APP_NAME.test(request.name) ? undefined : appNameProblem(request.name, this.#ports))
    if (problem !== undefined) throw new LauncherRefusal(problem)
    if ((request.starter === undefined) === (request.blend === undefined)) throw new LauncherRefusal('choose a starter or a Blend, not both')
    if (request.starter !== undefined && !STARTERS.some(starter => starter.value === request.starter)) throw new LauncherRefusal(`there is no starter "${request.starter}"`)
    if (request.blend !== undefined && !BLEND_ID.test(request.blend) && !BLEND_SOURCE.test(request.blend)) throw new LauncherRefusal(`"${request.blend}" is not a Blend id (for example acrylblends.notes) or a Blend on GitHub (github:owner/repo#tag)`)
    if (!MAKEABLE_SURFACES.includes(request.surface)) throw new LauncherRefusal('CLI (TUI) apps are coming: choose Web or Desktop')
    const folder = join(request.where, request.name)
    if (this.#ports.exists(folder)) throw new LauncherRefusal(`there is already a folder named ${request.name} in ${request.where}`)
    this.#ports.makeFolder(request.where)
    // What `acryl new` forwards to (the selector's `npm exec --yes create-acrylblends@latest -- <args>`), run directly so this screen does not depend on which
    // `acryl` release is installed; the line shown is the one a person types.
    const source = request.blend === undefined ? [request.starter ?? ''] : ['--from', request.blend]
    const args = ['exec', '--yes', CREATE_SPEC, '--', request.name, ...source]
    const line = `cd ${request.where} && acryl new ${request.name} ${source.join(' ')}`
    // npm_config_loglevel reaches the install a starter runs inside create-acrylblends too, so its minute shows each download instead of one still line.
    const run = this.#ports.runner({ program: 'npm', args, cwd: request.where, env: { ...this.#environment(), npm_config_loglevel: 'http' } })
    const step = request.blend === undefined
      ? `Step 1 of 2: getting ${request.name} and installing its dependencies (${CREATE_SPEC}, about a minute). Next: starting it.`
      : `Step 1 of 3: getting ${request.name} (${CREATE_SPEC}). Next: installing its dependencies, then starting it.`
    const job: Job = { name: request.name, kind: 'make', line, status: 'running', run, step, since: Date.now(), output: '' }
    this.#job = job
    this.#watch(undefined, run, { folder, surface: request.surface, job })
  }

  /** The registry's Blends, read again at most once a minute: the store is opened and closed often, and the registry is a public file. */
  async blends(): Promise<readonly BlendView[]> {
    if (this.#blends !== undefined && Date.now() - this.#blends.at < BLENDS_FRESH_MS) return this.#blends.list
    const list = await this.#ports.blends()
    this.#blends = { at: Date.now(), list }
    return list
  }

  /** The apps folder, made when it is not there yet: the assistant's agent works in it, and a folder that does not exist cannot be worked in. */
  assistantFolder(): string {
    this.#ports.makeFolder(this.#ports.appsFolder)
    return this.#ports.appsFolder
  }

  #entry(id: string): AppEntry {
    const entry = readApps(this.#ports.home).find(app => app.id === id)
    if (entry === undefined) throw new LauncherRefusal(`there is no app "${id}" in the list`)
    return entry
  }

  /** A door call, with "the app is not running" and a refusal as the sentence a person can act on. */
  async #door(id: string, run: (door: Door, folder: string) => Promise<DoorAnswer>): Promise<DoorAnswer> {
    const entry = this.#entry(id)
    let answer: DoorAnswer
    try {
      answer = await run(this.#ports.door, entry.path)
    } catch (cause) {
      if (cause instanceof DoorUnavailable) throw new LauncherRefusal(cause.message)
      throw cause
    }
    if (!answer.ok) throw new LauncherRefusal(answer.message ?? 'the app refused')
    return answer
  }

  /** The plugins of a running app: the ones its people made (shareable) and the ones pulled from a registry. */
  async plugins(id: string): Promise<readonly PluginView[]> {
    let answer: DoorAnswer
    try {
      answer = await this.#door(id, (door, folder) => door.call(folder, 'plugin-list', {}))
    } catch (cause) {
      // An app from an older Blueprint has neither plugin-share nor extensions: its door says so in words meant for an agent. Say it for a person.
      if (cause instanceof LauncherRefusal && /no extensions plugin to drive/u.test(cause.message)) {
        throw new LauncherRefusal('This app keeps its plugins in its own page: open it, then Settings > Plugins. Pulling a plugin from here needs an app made with a newer Blueprint.')
      }
      throw cause
    }
    const list = Array.isArray(answer.value) ? answer.value as Array<Record<string, unknown>> : []
    return list.filter(plugin => typeof plugin.name === 'string').map(plugin => ({
      name: String(plugin.name), version: typeof plugin.version === 'string' ? plugin.version : '', state: typeof plugin.state === 'string' ? plugin.state : '',
      ...typeof plugin.pulledFrom === 'string' ? { pulledFrom: plugin.pulledFrom } : {},
      ...typeof plugin.author === 'string' ? { author: plugin.author } : {},
    }))
  }

  /** Pull a plugin into a running app from a registry source (`github:owner/repo@version`), the way `acryl plugin pull` does. */
  async pullPlugin(id: string, source: string): Promise<PluginPullResponse> {
    if (source.trim() === '' || source.startsWith('-') || source.length > 1024) throw new LauncherRefusal('say where the plugin is, for example github:someone/pomodoro@0.1.0')
    const answer = await this.#door(id, (door, folder) => door.call(folder, 'plugin-pull', { source: source.trim() }))
    return { text: answer.text ?? 'Pulled.', plugins: await this.plugins(id) }
  }

  #checkPublish(request: PublishPlanRequest): void {
    if (!PLUGIN_NAME.test(request.plugin)) throw new LauncherRefusal(`"${request.plugin}" is not a plugin name`)
    if (request.owner !== undefined && !ACCOUNT_NAME.test(request.owner)) throw new LauncherRefusal(`"${request.owner}" is not a GitHub account name`)
    if (request.license !== undefined && !LICENSE_ID.test(request.license)) throw new LauncherRefusal(`"${request.license}" is not a license id`)
  }

  #options(request: PublishPlanRequest): Record<string, unknown> {
    return { ...request.owner === undefined ? {} : { owner: request.owner }, ...request.license === undefined ? {} : { license: request.license } }
  }

  /** What publishing a plugin would send (the account, repository, version, license and files). Sends nothing. */
  async publishPlan(request: PublishPlanRequest): Promise<PublishPlanView> {
    this.#checkPublish(request)
    const answer = await this.#door(request.id, (door, folder) => door.call(folder, 'plugin-publish', { name: request.plugin, ...this.#options(request) }))
    const plan = answer.value as Partial<PublishPlanView> | null
    if (plan === null || typeof plan !== 'object' || typeof plan.owner !== 'string' || typeof plan.repo !== 'string' || typeof plan.version !== 'string') {
      throw new LauncherRefusal('the app did not give a publish plan')
    }
    return {
      owner: plan.owner, repo: plan.repo, version: plan.version, visibility: String(plan.visibility ?? ''), license: String(plan.license ?? ''),
      createsRepository: plan.createsRepository === true, files: Array.isArray(plan.files) ? plan.files.map(String) : [],
      integrity: String(plan.integrity ?? ''), digest: String(plan.digest ?? ''), pullLine: String(plan.pullLine ?? ''),
    }
  }

  /** The person's yes: publish exactly the plan they read. The app sends it only if the plugin still matches that plan. */
  async publish(request: PublishRequest): Promise<PublishResponse> {
    this.#checkPublish(request)
    const answer = await this.#door(request.id, (door, folder) => door.confirmPublish(folder, { name: request.plugin, ...this.#options(request), confirm: request.plan }))
    const result = answer.value as { ok?: boolean, releaseUrl?: string, pullLine?: string, reason?: string, next?: string } | null
    if (result?.ok !== true) throw new LauncherRefusal(`Not published: ${result?.reason ?? 'the app did not answer'}${result?.next === undefined ? '' : `. ${result.next}`}`)
    return { releaseUrl: result.releaseUrl ?? '', pullLine: result.pullLine ?? '' }
  }

  /**
   * The app's own share command (`plugins/save/share-cli.ts`, acrylblends 1.5.5), run in its folder: it prints one JSON line, the plan or the result.
   * The app need not be running. An app made before that command has none, and is told how to get it.
   */
  async #shareCommand(request: AppSharePlanRequest, confirm: AppSharePlanView | undefined): Promise<Record<string, unknown>> {
    this.#toolsReady()
    const entry = this.#entry(request.id)
    if (request.owner !== undefined && !ACCOUNT_NAME.test(request.owner)) throw new LauncherRefusal(`"${request.owner}" is not a GitHub account name`)
    if (!this.#ports.exists(join(entry.path, SHARE_COMMAND))) {
      throw new LauncherRefusal(`This app was made before apps could share themselves. In ${entry.path} run "npx acrylblends@latest upgrade", then try again.`)
    }
    // The person's choice is kept where the app's own share reads it, so the plan, the share and every later save agree.
    if (request.visibility !== undefined && confirm === undefined) {
      try { setBlendVisibility(entry.path, request.visibility) } catch (cause) { throw new LauncherRefusal(`Could not set who may see it: ${cause instanceof Error ? cause.message : String(cause)}`) }
    }
    // The plan goes back base64url-encoded: on Windows the command starts through a shell, which would take JSON's quotes.
    const args = [SHARE_COMMAND, '--json', ...request.owner === undefined ? [] : ['--owner', request.owner], ...confirm === undefined ? [] : ['--confirm', Buffer.from(JSON.stringify(confirm), 'utf8').toString('base64url')]]
    const run = this.#ports.runner({ program: 'node', args, cwd: entry.path, env: this.#environment() })
    let output = ''
    run.onOutput((text) => { output += text })
    const end = await new Promise<{ code: number | null, notFound: boolean, error?: string }>((resolve) => { run.onEnd(resolve) })
    if (end.notFound) throw new LauncherRefusal('Node.js was not found on this machine. Install Node.js 22.19 or later from nodejs.org, then try again.')
    const line = output.split(/\r?\n/u).map(text => text.trim()).findLast(text => text.startsWith('{'))
    let answer: unknown
    try { answer = line === undefined ? undefined : JSON.parse(line) } catch { answer = undefined }
    if (answer === null || typeof answer !== 'object') throw new LauncherRefusal(tail(output) === '' ? 'the app did not answer' : tail(output))
    const value = answer as Record<string, unknown>
    if (value.ok === false) throw new LauncherRefusal(`Not shared: ${typeof value.reason === 'string' ? value.reason : 'the app refused'}`)
    return value
  }

  /** What sharing the app would send: the repository (a new one, or the remote it has), its visibility and how many changed files are saved first. Sends nothing. */
  async sharePlan(request: AppSharePlanRequest): Promise<AppSharePlanView> {
    const plan = await this.#shareCommand(request, undefined)
    if (typeof plan.repository !== 'string' || typeof plan.create !== 'boolean' || (plan.visibility !== 'private' && plan.visibility !== 'public') || typeof plan.changes !== 'number') {
      throw new LauncherRefusal('the app did not give a share plan')
    }
    return { repository: plan.repository, create: plan.create, visibility: plan.visibility, changes: plan.changes }
  }

  /** The person's yes: share exactly the plan they read. The app sends it only if it still matches that plan. */
  async share(request: AppShareRequest): Promise<AppShareResponse> {
    const result = await this.#shareCommand(request, request.plan)
    if (result.ok !== true || typeof result.remote !== 'string') throw new LauncherRefusal('Not shared: the app did not answer')
    return { remote: result.remote, created: result.created === true }
  }

  async health(probe: Runner = this.#ports.runner): Promise<HealthView> {
    const version = (program: string): Promise<string | undefined> => new Promise((resolve) => {
      const run = probe({ program, args: ['--version'], cwd: this.#ports.home, env: this.#environment() })
      let text = ''
      run.onOutput((chunk) => { text += chunk })
      run.onEnd(end => { resolve(end.code === 0 && !end.notFound ? text.trim().split(/\s+/u)[0]?.replace(/^v/u, '') : undefined) })
    })
    const [node, npm] = await Promise.all([version('node'), version('npm')])
    return { ...node === undefined ? {} : { node }, ...npm === undefined ? {} : { npm }, modelKey: readModelKey(this.#ports.home) !== undefined, home: this.#ports.home }
  }

  /** The saved key, masked, for the screen's Settings and Health; never the key itself. */
  maskedModelKey(): string | undefined {
    const key = readModelKey(this.#ports.home)
    return key === undefined ? undefined : maskKey(key)
  }

  #environment(): Record<string, string | undefined> {
    const inherited = this.#ports.environment()
    // `modelEnv` and `githubEnv` return only what to add (the saved key or GitHub token, unless the environment already names one).
    // The fetched tools come first on PATH, so an app runs on the Node.js the launcher made sure of.
    return appEnvironment(toolsEnv(this.#ports.home, { ...inherited, ...modelEnv(this.#ports.home, inherited), ...githubEnv(this.#ports.home, inherited) }))
  }

  /** Who is signed in to GitHub here (the token apps get as GH_TOKEN), never the token. */
  github(): GithubView {
    return { available: githubClientId(this.#ports.environment()) !== undefined, login: readGithub(this.#ports.home)?.login ?? null }
  }

  /** Start GitHub's device sign-in: the code for the person; the device code stays here until it is approved, refused or expires. */
  async githubStart(): Promise<GithubStartView> {
    const clientId = githubClientId(this.#ports.environment())
    if (clientId === undefined) throw new LauncherRefusal('this build of Control Center has no GitHub app to sign in with')
    try {
      const started = await startGithubSignIn(clientId)
      this.#signIn = { clientId, deviceCode: started.deviceCode, until: Date.now() + started.expiresIn * 1000 }
      return { userCode: started.userCode, verificationUri: started.verificationUri, interval: started.interval }
    } catch (cause) {
      throw new LauncherRefusal(`GitHub sign-in could not start: ${cause instanceof Error ? cause.message : String(cause)}. Check the network and try again.`)
    }
  }

  /** One poll of the sign-in under way: pending, connected (the token is saved and every app started from now on gets it), or failed. */
  async githubPoll(): Promise<GithubPollView> {
    const signIn = this.#signIn
    if (signIn === undefined) return { state: 'failed', reason: 'no GitHub sign-in is under way: start it again' }
    if (Date.now() > signIn.until) { this.#signIn = undefined; return { state: 'failed', reason: 'the code expired: start the sign-in again' } }
    try {
      const answer = await pollGithubSignIn(this.#ports.home, signIn.clientId, signIn.deviceCode)
      if (answer.state !== 'pending') this.#signIn = undefined
      return answer
    } catch {
      // A network blip between polls: keep waiting; the code's own expiry ends a sign-in that never comes back.
      return { state: 'pending' }
    }
  }

  /** Forget the GitHub connection on this machine. Apps started from now on no longer get the token. */
  githubDisconnect(): GithubView {
    this.#signIn = undefined
    clearGithub(this.#ports.home)
    return this.github()
  }

  /**
   * Follow one process. For an app being started, `id` is known; for one being made it is not until the folder has its blend.yaml, which is when the app
   * is listed and the process becomes that app's.
   */
  #watch(id: string | undefined, run: Run, making: { folder: string, surface: Surface, job: Job } | undefined): void {
    const started: Started = { run, address: undefined, output: '' }
    let appId = id
    if (appId !== undefined) this.#started.set(appId, started)
    run.onOutput((text) => {
      started.output = tail(`${started.output}${text}`)
      if (making !== undefined && making.job.run === run) making.job.output = started.output
      started.address ??= ADDRESS.exec(text)?.[0]
      if (making !== undefined && appId === undefined && this.#ports.exists(join(making.folder, APP_MARKER))) {
        const listed = addApp(this.#ports.home, { path: making.folder, surface: making.surface }).entry
        appId = listed.id
        this.#started.set(appId, started)
      }
      if (making !== undefined && started.address !== undefined && making.job.status === 'running') making.job.status = 'done'
    })
    run.onEnd((end) => {
      if (appId !== undefined && this.#started.get(appId) === started) {
        this.#started.delete(appId)
        // An app that ends after being stopped on purpose is not a failure; one that ends on its own with a non-zero code is. A Desktop app that was up
        // ends when its window is closed, the normal way to stop it: that is not a failure either (it showed "It stopped on its own" with its start log).
        const closed = started.address !== undefined && readApps(this.#ports.home).find(entry => entry.id === appId)?.surface === 'desktop'
        if (end.code !== 0 && end.code !== null && !end.notFound && !closed) this.#failures.set(appId, started.output.trimEnd())
      }
      if (end.notFound) this.#note(making, 'failed', 'Node.js and npm were not found on this machine. Install Node.js 22.19 or later from nodejs.org, then try again.', id)
      else if (making !== undefined && making.job.status === 'running') {
        // `create-acrylblends` installs the app and ends cleanly without starting it: a clean end with the app listed is "made", and the app is started
        // the way the walk of the terminal ends ("makes an app and runs it").
        if (end.code === 0 && appId !== undefined) {
          // An app made from a registry Blend arrives without its dependencies (`acryl new --from` prints "npm install" as the next step; a starter installs
          // itself): install them here, so what is started can run.
          if (this.#ports.exists(join(making.folder, 'node_modules'))) this.#finish(appId, making.job)
          else this.#install(appId, making.folder, making.job)
        } else making.job.status = 'failed'
      }
      if (making !== undefined && making.job.status === 'failed' && making.job.message === undefined) making.job.message = started.output === '' ? (end.error ?? 'The command ended before the app was made.') : started.output.trimEnd()
    })
  }

  /** The job's last step: the app is made, so it is started (a Desktop app opens its window). */
  #finish(appId: string, job: Job): void {
    job.status = 'done'
    job.step = `Made. Starting ${job.name} now: its progress shows on its card below.`
    job.output = ''
    delete job.message
    try { this.start(appId) } catch (cause) { this.#failures.set(appId, cause instanceof Error ? cause.message : String(cause)) }
  }

  /** `npm install` in the new app's folder, as the job's second step; the job is still running while it does, and says so. */
  #install(appId: string, folder: string, job: Job): void {
    // The app is listed already; until its install ends its card shows it starting, with the install's lines, not as stopped.
    this.#installing.set(appId, job)
    job.step = 'Step 2 of 3: installing its dependencies (npm install, about a minute). Next: starting it.'
    job.output = ''
    // `--loglevel http` makes npm print each download, so the screen shows it working instead of a silent minute.
    const run = this.#ports.runner({ program: 'npm', args: ['install', '--loglevel', 'http'], cwd: folder, env: this.#environment() })
    job.run = run
    let output = ''
    run.onOutput((text) => { output = tail(`${output}${text}`); job.output = output })
    run.onEnd((end) => {
      this.#installing.delete(appId)
      if (job.run !== run) return
      if (end.notFound) { job.status = 'failed'; job.message = 'Node.js and npm were not found on this machine. Install Node.js 22.19 or later from nodejs.org, then try again.' } else if (end.code === 0) this.#finish(appId, job)
      else { job.status = 'failed'; job.message = output === '' ? (end.error ?? 'npm install ended before the app could run.') : output.trimEnd() }
    })
  }

  #note(making: { job: Job } | undefined, status: 'failed', message: string, id: string | undefined): void {
    if (making !== undefined) {
      making.job.status = status
      making.job.message = message
    } else if (id !== undefined) this.#failures.set(id, message)
  }
}

/** `0.2.0` is newer than `0.1.9`; anything that is not three numbers is never newer. */
function newerVersion(candidate: string, current: string): boolean {
  const parse = (text: string): number[] | undefined => /^(\d+)\.(\d+)\.(\d+)$/u.exec(text)?.slice(1).map(Number)
  const a = parse(candidate)
  const b = parse(current)
  if (a === undefined || b === undefined) return false
  for (let index = 0; index < 3; index += 1) if (a[index] !== b[index]) return (a[index] ?? 0) > (b[index] ?? 0)
  return false
}
