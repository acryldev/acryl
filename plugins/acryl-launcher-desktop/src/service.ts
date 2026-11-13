/**
 * What the ACRYL screen does, as one service with ports (Clean Architecture: the routes and the Cordis plugin are the edge; this holds the rules).
 * The list is the registry `<home>/apps.json` (`acryl-launcher`, the same file `acryl apps` and the terminal read); what runs is held here, in
 * memory, because the launcher records no port: an app is "running" when this service started it and it has not ended.
 */
import { basename, join } from 'node:path'
import {
  addApp, APP_NAME, appNameProblem, APP_MARKER, blendOf, inspectApp, maskKey, modelEnv, readApps, readModelKey, removeApp, STARTERS, whereProblem,
  type AppEntry,
} from 'acryl-launcher'
import type { AppRunState, AppView, BlendView, HealthView, JobView, NewAppRequest, StateResponse, Surface } from './contract.ts'
import { BLEND_ID, MAKEABLE_SURFACES } from './contract.ts'
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
}

/** The address an app prints, with the token it needs: `http://127.0.0.1:3999/?token=...`. */
const ADDRESS = /https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d+[^\s'")\]]*/u
const TAIL_LINES = 6
const BLENDS_FRESH_MS = 60_000
/** The package `acryl new` runs (`distribution/acryl-npm-launcher/forward.js` CREATE_SPEC). */
const CREATE_SPEC = 'create-acrylblends@latest'
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/gu

const tail = (text: string): string => text.replace(ANSI, '').split(/\r?\n/u).map(line => line.trim()).filter(line => line !== '').slice(-TAIL_LINES).join('\n')

/** The job as this service changes it; `JobView` is what the screen is told. */
interface Job {
  readonly name: string
  readonly line: string
  status: JobView['status']
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

  constructor(ports: LauncherPorts) { this.#ports = ports }

  state(): StateResponse {
    const apps = readApps(this.#ports.home).map(entry => this.#view(entry))
    const job = this.#job === undefined ? null : { name: this.#job.name, line: this.#job.line, status: this.#job.status, ...this.#job.message === undefined ? {} : { message: this.#job.message } }
    return { apps, appsFolder: this.#ports.appsFolder, starters: STARTERS, job }
  }

  #view(entry: AppEntry): AppView {
    const started = this.#started.get(entry.id)
    const missing = inspectApp(entry).state === 'missing'
    const state: AppRunState = missing ? 'missing' : started === undefined ? 'stopped' : started.address === undefined ? 'starting' : 'running'
    const failure = this.#failures.get(entry.id)
    return {
      id: entry.id, name: basename(entry.path), path: entry.path, blend: entry.blend === '' ? blendOf(entry.path) : entry.blend, madeBy: entry.madeBy, surface: entry.surface, state,
      ...started?.address === undefined ? {} : { address: started.address },
      ...failure === undefined || state !== 'stopped' ? {} : { failure },
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
  start(id: string): void {
    const entry = readApps(this.#ports.home).find(app => app.id === id)
    if (entry === undefined) throw new LauncherRefusal(`there is no app "${id}" in the list`)
    if (inspectApp(entry).state === 'missing') throw new LauncherRefusal(`the folder ${entry.path} is gone: remove it from the list, or put it back`)
    if (this.#started.has(id)) return
    this.#failures.delete(id)
    // An app whose dependencies are not installed (one pulled from the registry in a terminal, or copied) cannot run: install them first, shown as "starting".
    if (!this.#ports.exists(join(entry.path, 'node_modules'))) { this.#installThenStart(id, entry.path); return }
    const run = this.#ports.runner({ program: 'npm', args: ['run', entry.surface === 'desktop' ? 'desktop' : 'dev'], cwd: entry.path, env: this.#environment() })
    this.#watch(id, run, undefined)
  }

  #installThenStart(id: string, folder: string): void {
    const run = this.#ports.runner({ program: 'npm', args: ['install'], cwd: folder, env: this.#environment() })
    const started: Started = { run, address: undefined, output: '' }
    this.#started.set(id, started)
    run.onOutput((text) => { started.output = tail(`${started.output}${text}`) })
    run.onEnd((end) => {
      if (this.#started.get(id) !== started) return
      this.#started.delete(id)
      if (end.notFound) this.#failures.set(id, 'Node.js and npm were not found on this machine. Install Node.js 22.19 or later from nodejs.org, then try again.')
      else if (end.code === 0) { try { this.start(id) } catch (cause) { this.#failures.set(id, cause instanceof Error ? cause.message : String(cause)) } }
      else if (end.code !== null) this.#failures.set(id, started.output === '' ? (end.error ?? 'npm install ended before the app could run.') : started.output)
    })
  }

  stop(id: string): void {
    this.#started.get(id)?.run.stop()
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
    if (this.#job?.status === 'running') throw new LauncherRefusal(`${this.#job.name} is still being made: wait for it to finish`)
    const problem = whereProblem(request.where) ?? (APP_NAME.test(request.name) ? undefined : appNameProblem(request.name, this.#ports))
    if (problem !== undefined) throw new LauncherRefusal(problem)
    if ((request.starter === undefined) === (request.blend === undefined)) throw new LauncherRefusal('choose a starter or a Blend, not both')
    if (request.starter !== undefined && !STARTERS.some(starter => starter.value === request.starter)) throw new LauncherRefusal(`there is no starter "${request.starter}"`)
    if (request.blend !== undefined && !BLEND_ID.test(request.blend)) throw new LauncherRefusal(`"${request.blend}" is not a Blend id (for example acrylblends.notes)`)
    if (!MAKEABLE_SURFACES.includes(request.surface)) throw new LauncherRefusal('CLI (TUI) apps are coming: choose Web or Desktop')
    const folder = join(request.where, request.name)
    if (this.#ports.exists(folder)) throw new LauncherRefusal(`there is already a folder named ${request.name} in ${request.where}`)
    this.#ports.makeFolder(request.where)
    // What `acryl new` forwards to (the selector's `npm exec --yes create-acrylblends@latest -- <args>`), run directly so this screen does not depend on which
    // `acryl` release is installed; the line shown is the one a person types.
    const source = request.blend === undefined ? [request.starter ?? ''] : ['--from', request.blend]
    const args = ['exec', '--yes', CREATE_SPEC, '--', request.name, ...source]
    const line = `cd ${request.where} && acryl new ${request.name} ${source.join(' ')}`
    const run = this.#ports.runner({ program: 'npm', args, cwd: request.where, env: this.#environment() })
    const job: Job = { name: request.name, line, status: 'running', run }
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
    // `modelEnv` returns only what to add (the saved key, unless the environment already names one).
    return appEnvironment({ ...inherited, ...modelEnv(this.#ports.home, inherited) })
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
        // An app that ends after being stopped on purpose is not a failure; one that ends on its own with a non-zero code is.
        if (end.code !== 0 && end.code !== null && !end.notFound) this.#failures.set(appId, started.output)
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
      if (making !== undefined && making.job.status === 'failed' && making.job.message === undefined) making.job.message = started.output === '' ? (end.error ?? 'The command ended before the app was made.') : started.output
    })
  }

  /** The job's last step: the app is made, so it is started (a Desktop app opens its window). */
  #finish(appId: string, job: Job): void {
    job.status = 'done'
    delete job.message
    try { this.start(appId) } catch (cause) { this.#failures.set(appId, cause instanceof Error ? cause.message : String(cause)) }
  }

  /** `npm install` in the new app's folder, as the job's second step; the job is still running while it does, and says so. */
  #install(appId: string, folder: string, job: Job): void {
    job.message = 'Installing its dependencies (about a minute).'
    const run = this.#ports.runner({ program: 'npm', args: ['install'], cwd: folder, env: this.#environment() })
    job.run = run
    let output = ''
    run.onOutput((text) => { output = tail(`${output}${text}`) })
    run.onEnd((end) => {
      if (job.run !== run) return
      if (end.notFound) { job.status = 'failed'; job.message = 'Node.js and npm were not found on this machine. Install Node.js 22.19 or later from nodejs.org, then try again.' } else if (end.code === 0) this.#finish(appId, job)
      else { job.status = 'failed'; job.message = output === '' ? (end.error ?? 'npm install ended before the app could run.') : output }
    })
  }

  #note(making: { job: Job } | undefined, status: 'failed', message: string, id: string | undefined): void {
    if (making !== undefined) {
      making.job.status = status
      making.job.message = message
    } else if (id !== undefined) this.#failures.set(id, message)
  }
}
