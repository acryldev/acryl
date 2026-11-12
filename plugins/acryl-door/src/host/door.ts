/**
 * The door's verbs, one implementation for every face: `brief`, `look`, `act`, `plugin list|add|remove|reload` and `tool list|call`
 * (`verbs.ts` lists them; the operator client, MCP and the built-in chat all call these). Each verb takes plain JSON arguments,
 * returns a typed value and a text rendering, and fails with a {@link DoorError} or a {@link UiControlError} carrying a code.
 */

import { existsSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { underAppBase } from '../page/base.ts'
import { parseUiRequest, UiControlError, type AuditEntry, type UiActionResult, type UiRequest, type UiResult, type UiSnapshot } from '../page/protocol.ts'
import { renderSnapshot } from '../page/snapshot-text.ts'
import type { AuditLog } from './audit.ts'
import { ShellError, parseShellRequest, type ShellErrorCode, type ShellOp, type ShellRequest, type ShellResult } from '../shell/protocol.ts'
import type { UiChannel } from './channel.ts'
import { NO_DESKTOP, type ShellChannel } from './shell.ts'
import { VERB_SPECS, VERBS } from './verbs.ts'

export type DoorErrorCode = 'invalid' | 'unknown-verb' | 'unavailable' | 'not-exposed' | 'outside-app' | 'failed' | 'refused' | ShellErrorCode

export class DoorError extends Error {
  readonly code: DoorErrorCode

  constructor(code: DoorErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'DoorError'
  }
}

/** The slice of acrylblends' `extensions` service the plugin verbs use, declared here so the door does not depend on that plugin. */
export interface ExtensionsPort {
  install(source: string): Promise<unknown>
  remove(name: string): Promise<unknown>
  reload(): Promise<unknown>
  list(): readonly unknown[]
}

/** The slice of acrylblends' `pluginShare` service the pull, list and remove verbs use. */
export interface PluginSharePort {
  /** The plugins installed while the app runs, a pulled one with its source and author. */
  list(): readonly unknown[]
  /** Take a plugin out and forget its record; a pulled folder still holding the release as pulled goes too. */
  remove(name: string): Promise<unknown>
  pull(source: string): Promise<PullView>
  /** Pull each source of a group's list on its own: one that is refused does not stop the others. */
  pullList(from: string): Promise<PullListView>
  planPublish(name: string, options?: PublishOptionsView): Promise<PublishPlanView | { readonly ok: false; readonly reason: string; readonly next: string }>
  publish(name: string, confirmed: PublishPlanView, options?: PublishOptionsView): Promise<{ readonly ok: boolean; readonly reason?: string }>
}

/** What one pull did, or why it was refused. */
export interface PullView { readonly ok: boolean; readonly action?: string; readonly name?: string; readonly reason?: string; readonly next?: string }

/** What a list pull did for each source, or why the list itself was refused (then nothing was pulled). */
export type PullListView =
  | { readonly ok: true; readonly from: string; readonly entries: readonly { readonly line: number; readonly source: string; readonly result: PullView }[] }
  | { readonly ok: false; readonly reason: string; readonly next: string }

/** Who a plan publishes as, and under which license; the service's defaults when absent. */
export interface PublishOptionsView {
  readonly owner?: string
  readonly license?: string
}

/** A plan as the door shows it. The service owns it; the door passes it back unchanged. */
export interface PublishPlanView {
  readonly owner: string
  readonly repo: string
  readonly version: string
  readonly visibility: string
  readonly license: string
  readonly createsRepository: boolean
  readonly files: readonly string[]
  readonly digest: string
  readonly pullLine: string
}

/** What a plan says, for a person deciding. */
export function renderPublishPlan(plan: PublishPlanView): string {
  return [
    `Publish to ${plan.owner}/${plan.repo}${plan.createsRepository ? ' (a new repository)' : ''}, ${plan.visibility}, version ${plan.version}, license ${plan.license}.`,
    `Files: ${plan.files.join(', ')}.`,
    `A friend gets exactly these bytes with: ${plan.pullLine}`,
  ].join('\n')
}

/** The slice of acrylblends' `tools` registry (the `agent` plugin's) the tool verbs use, and where the built-in chat finds the verbs. */
export interface ToolsPort {
  /** @returns the function that removes the tool. @throws when the name is taken. */
  register(name: string, tool: { readonly description: string; readonly parameters?: Readonly<Record<string, unknown>>; run(input: unknown, options?: { signal?: AbortSignal; page?: string }): unknown }): () => void
  list(): ReadonlyArray<{ readonly name: string; readonly description: string }>
  call(name: string, input: unknown): Promise<unknown>
}

export interface DoorDeps {
  readonly channel: UiChannel
  /** The desktop shell (the Electron main process of `npm run desktop`), when the app can have one. */
  readonly shell?: ShellChannel
  readonly audit: AuditLog
  /** The app's name, folder and, when it listens, its address (what `brief` prints so an agent can curl the running app). */
  readonly app: { readonly name: string; readonly root: string; readonly url?: string | undefined }
  /** The prefix the app's pages answer under (the frame's canvas, `/app`); absent on the app's own server, at the root. */
  readonly appBase?: string | undefined
  /** Read at each call: the services may come and go while the door runs. */
  readonly extensions: () => ExtensionsPort | undefined
  /** Read at each call, as `extensions` is; absent where the app has no plugin-share row. */
  readonly pluginShare?: () => PluginSharePort | undefined
  readonly tools: () => ToolsPort | undefined
  /** The app tools the door offers; anything else is refused before it reaches the registry. */
  readonly expose: readonly string[]
  /** Reload the open pages after a plugin was added, removed or reloaded, so the page an agent looks at next is the new one. Default: true. */
  readonly reloadOnChange?: boolean
  /** How long a reload or a move may take before the new page has connected again (tests shorten it). Default 15 s. */
  readonly pageBackMs?: number
}

/** Who a verb runs for: `page`, the door's id of the page a run was asked from; its look and act go to that page alone (followed into its tab), never to another one. */
export interface VerbScope {
  readonly page?: string
}

/** What one verb answered: the value for `--json` and programs, the text for an agent reading a terminal. */
export interface VerbAnswer {
  readonly value: unknown
  readonly text: string
}

/** A shell answer as text an agent reads: windows and menu items one to a line. */
function renderShell(result: ShellResult): string {
  if ('windows' in result) {
    return result.windows.length === 0
      ? 'no windows are open'
      : result.windows.map(window => `${String(window.id)}  ${JSON.stringify(window.title)}  ${window.path}  ${String(window.width)}x${String(window.height)}${window.x === undefined || window.y === undefined ? '' : `@${String(window.x)},${String(window.y)}`}${window.focused ? '  focused' : ''}`).join('\n')
  }
  if ('items' in result) return result.items.length === 0 ? 'the app has no menu' : result.items.map(item => `${item.path}${item.enabled ? '' : '  (disabled)'}${item.ends === true ? '  (ends the app; needs force)' : ''}`).join('\n')
  return result.detail
}

/** The files an agent should read first, when the app has them. */
const SELF_KNOWLEDGE = ['AGENTS.md', 'CLAUDE.md', '.agents/skills', '.claude/skills', 'docs', 'plugins']

/** How long a reload or a move may take before the new page has connected to the door again. */
const PAGE_BACK_MS = 15_000

export class Door {
  private readonly deps: DoorDeps

  constructor(deps: DoorDeps) {
    this.deps = deps
  }

  /** A run asked for from the panel of this page is going: its verbs that name no window are for that page. @returns the function to call when the run ends. */
  driveFor(windowId: string): () => void {
    return this.deps.channel.driveFor(windowId)
  }

  /** Run one verb. @throws DoorError or UiControlError. */
  async run(verb: string, args: unknown, signal: AbortSignal, scope: VerbScope = {}): Promise<VerbAnswer> {
    const input = (typeof args === 'object' && args !== null && !Array.isArray(args) ? args : {}) as Record<string, unknown>
    switch (verb) {
      case 'brief': return this.brief()
      case 'look': {
        const snapshot = await this.look(input, signal, scope)
        return { value: snapshot, text: renderSnapshot(snapshot, cursor => `run look --cursor ${String(cursor)}`) }
      }
      case 'act': {
        const result = await this.act(input, signal, scope)
        return { value: result, text: `done${result.target === undefined ? '' : `: ${result.target.role} "${result.target.name}"`}${result.detail === undefined ? '' : ` (${result.detail})`}; look again before the next act` }
      }
      case 'plugin-list': return this.plugin(plugins => plugins.list(), false, this.installed())
      case 'plugin-add': return this.plugin(extensions => extensions.install(this.insideApp(input.folder)))
      case 'plugin-pull': return input.from === undefined ? this.pull(input.source) : this.pullList(input.from, input.source)
      case 'plugin-publish': return this.planPublish(input)
      case 'plugin-remove': {
        const name = input.name
        if (typeof name !== 'string' || name === '') throw new DoorError('invalid', 'plugin remove needs a plugin name')
        return this.plugin(plugins => plugins.remove(name), true, this.installed())
      }
      case 'plugin-reload': return this.plugin(extensions => extensions.reload())
      case 'tool-list': {
        const offered = this.offeredTools()
        return { value: offered, text: offered.length === 0 ? 'no app tools are offered through the door (tools.expose is empty)' : offered.map(tool => `${tool.name}: ${tool.description}`).join('\n') }
      }
      case 'tool-call': return this.callTool(input)
      case 'window-list': case 'window-open': case 'window-focus': case 'window-close': case 'window-resize': case 'menu-list': case 'menu-click':
        return this.desktop(verb, input, signal)
      default: throw new DoorError('unknown-verb', `unknown verb ${JSON.stringify(verb)}; the verbs are ${VERBS.join(', ')}`)
    }
  }

  brief(): VerbAnswer {
    const { name, root, url } = this.deps.app
    const read = SELF_KNOWLEDGE.filter(path => existsSync(resolve(root, path)))
    const value = {
      app: name,
      root,
      ...(url === undefined ? {} : { url }),
      read,
      page: this.deps.channel.connected ? 'open' : 'not open',
      plugins: this.deps.extensions() === undefined ? 'unavailable' : 'available',
      verbs: VERBS.map(verb => VERB_SPECS[verb].usage),
    }
    const text = [
      `App ${name} in ${root}.`,
      ...(url === undefined ? [] : [`Address: ${url} (the running app; curl it to check a route).`]),
      read.length === 0 ? 'No AGENTS.md or skill in the folder.' : `Read first: ${read.join(', ')}.`,
      `Page: ${value.page}${value.page === 'not open' ? ' (open the app in a browser to look and act)' : ''}.`,
      `Live plugins: ${value.plugins}.`,
      'Verbs:',
      ...value.verbs.map(line => `  ${line}`),
    ].join('\n')
    return { value, text }
  }

  look(input: Record<string, unknown>, signal: AbortSignal, scope: VerbScope = {}): Promise<UiSnapshot> {
    const { window, rest } = this.windowOf(input, scope)
    const request = this.parse({ ...rest, op: 'snapshot' })
    return this.callPage('look', request, signal, window, scope.page) as Promise<UiSnapshot>
  }

  async act(input: Record<string, unknown>, signal: AbortSignal, scope: VerbScope = {}): Promise<UiActionResult> {
    if (input.op === 'snapshot') throw new DoorError('invalid', 'use look to see the page')
    const { window, rest } = this.windowOf(input, scope)
    const request = this.parse(rest)
    const page = scope.page
    // A reload or a navigate replaces the page; a click, a key or typing may (a link, a form that submits), and the page says so when it does.
    const moves = request.op === 'reload' || request.op === 'navigate'
    if (!moves && request.op !== 'click' && request.op !== 'press' && request.op !== 'type')
      return await this.callPage(`act ${String(input.op)}`, request, signal, window, page) as UiActionResult
    // Wait for the new page to connect, so the next look sees it; the wait starts before the act, or a fast page is missed. The page may drop before it has answered;
    // that is the move working. A run's own page comes back in its own tab; no other page that happens to connect meanwhile is taken for it.
    const backMs = this.deps.pageBackMs ?? PAGE_BACK_MS
    const stay = new AbortController()
    const back = page === undefined ? this.deps.channel.expectNewPage(backMs, stay.signal) : this.deps.channel.expectPageBack(page, backMs, stay.signal)
    let answer: UiActionResult
    let left = moves
    try {
      answer = await this.callPage(`act ${request.op}`, request, signal, window, page) as UiActionResult
      left ||= answer.leaving === true
    } catch (cause) {
      if (!(cause instanceof UiControlError && cause.code === 'disconnected')) { stay.abort(); throw cause }
      answer = { ok: true, detail: request.op === 'reload' ? 'reloading' : request.op === 'navigate' ? `going to ${request.path}` : 'the page is going to another address' }
      left = true
    }
    if (!left) {
      stay.abort()
      return answer
    }
    const came = await back
    // The page that came back is the one this agent was driving: it stays the target until the person focuses another page. A run that names its page follows that page's tab instead.
    if (came !== undefined && page === undefined) this.deps.channel.prefer(came)
    if (came === undefined)
      throw new UiControlError('timeout', request.op === 'reload' ? 'the page did not come back after the reload'
        : request.op === 'navigate' ? `the page did not come back after going to ${request.path}: is there a page at that path, and does it load the door's script?`
        : `the ${request.op} took the page to another address, and no page came back: does the page there load the door's script?`)
    const landed = request.op === 'navigate' ? await this.statusAt(request.path) : undefined
    return { ...answer, detail: `${answer.detail ?? 'done'}${landed === undefined ? '' : `; ${landed}`}; the page is back: look again` }
  }

  /**
   * What the app answers at a path the page was sent to, so an agent that mistyped one is told ("404 at /nope") and not left to find out from a page it did not expect.
   * A second GET of the same path (a page is read-only); nothing when the app has no address or does not answer in time.
   */
  private async statusAt(path: string): Promise<string | undefined> {
    const base = this.deps.app.url
    if (base === undefined) return undefined
    try {
      // The app's own path, under the host prefix when the pages answer there (the frame's canvas): /board is /app/board in the canvas and /board at the
      // root, and the app's root is the prefix itself (`/app`, where its rows mount `/`), as the page's navigation join does it.
      const target = underAppBase(this.deps.appBase ?? '', path)
      const response = await fetch(new URL(target, base), { headers: { accept: 'text/html' }, signal: AbortSignal.timeout(3000) })
      await response.body?.cancel()
      return response.ok ? `${response.status} at ${path}` : `${response.status} at ${path}: the app serves no page there, look at what is shown and navigate to a path it does`
    } catch {
      return undefined
    }
  }

  /**
   * The windows and the menu of the desktop app, through the shell. Every call is audited with the window it was about; a call with no shell attached answers one line that says what to run;
   * closing the last window is refused unless the call says `force` (it ends the desktop app, and the session an agent works in with it).
   */
  private async desktop(verb: ShellOp, input: Record<string, unknown>, signal: AbortSignal): Promise<VerbAnswer> {
    const shell = this.deps.shell
    let request: ShellRequest
    try {
      request = parseShellRequest(verb, input)
    } catch (cause) {
      throw new DoorError('invalid', cause instanceof Error ? cause.message : 'invalid request')
    }
    const windowId = 'id' in request ? request.id : undefined
    const record = (outcome: AuditEntry['outcome'], detail?: string, windowOf?: number): void => {
      const id = windowOf ?? windowId
      this.deps.audit.record({
        at: new Date().toISOString(), tool: verb,
        ...(request.op === 'menu-click' ? { target: { role: 'menuitem', name: request.path } } : {}),
        ...(id === undefined ? {} : { window: id }),
        outcome, ...(detail === undefined ? {} : { detail }), approval: 'token',
      })
    }
    try {
      if (shell === undefined || !shell.connected) throw new ShellError('no-desktop', NO_DESKTOP)
      if (request.op === 'window-close' && request.force !== true) {
        const { windows } = await shell.call({ op: 'window-list' }, { signal }) as Extract<ShellResult, { windows: unknown }>
        if (windows.length === 1 && windows[0]?.id === request.id) {
          throw new ShellError('last-window', `window ${String(request.id)} is the app's last window: closing it ends the desktop app. Open another window first, or pass force to end it on purpose`)
        }
      }
      const result = await shell.call(request, { signal })
      const openedId = 'id' in result ? result.id : undefined
      record('ok', undefined, openedId)
      return { value: result, text: renderShell(result) }
    } catch (cause) {
      if (!(cause instanceof ShellError)) throw cause
      record(['invalid', 'no-such-window', 'last-window', 'no-such-menu-item', 'disabled', 'quits-app', 'no-desktop'].includes(cause.code) ? 'refused' : 'failed', cause.code)
      throw new DoorError(cause.code, cause.message)
    }
  }

  /** `window` on look and act: the desktop window (the number `window list` prints) whose page the call is for; without it, the page used last. */
  private windowOf(input: Record<string, unknown>, scope: VerbScope = {}): { window: number | undefined; rest: Record<string, unknown> } {
    const { window, ...rest } = input
    if (window === undefined) return { window: undefined, rest }
    // A run that is for one page cannot be pointed at a desktop window instead.
    if (scope.page !== undefined) throw new DoorError('invalid', 'this run drives only the page it was asked from; window does not apply')
    if (typeof window !== 'number' || !Number.isSafeInteger(window) || window < 1) throw new DoorError('invalid', 'window must be the number `window list` prints for the window')
    return { window, rest }
  }

  private parse(input: Record<string, unknown>): UiRequest {
    try {
      return parseUiRequest(input)
    } catch (cause) {
      throw new DoorError('invalid', cause instanceof Error ? cause.message : 'invalid request')
    }
  }

  /** Run one call on the page and record it. The audit holds which control was touched and how it ended, never what was typed. */
  private async callPage(verb: string, request: UiRequest, signal: AbortSignal, window?: number, page?: string): Promise<UiResult> {
    const approval: AuditEntry['approval'] = 'token'
    try {
      const value = await this.deps.channel.call(request, { signal, ...(window === undefined ? {} : { window }), ...(page === undefined ? {} : { page }), ...(request.op === 'wait' ? { timeoutMs: (request.timeoutMs ?? 3000) + 5000 } : {}) })
      const target = 'target' in value ? value.target : undefined
      this.deps.audit.record({ at: new Date().toISOString(), tool: verb, ...(target === undefined ? {} : { target }), ...(window === undefined ? {} : { window }), outcome: 'ok', approval })
      return value
    } catch (cause) {
      const code = cause instanceof UiControlError ? cause.code : 'failed'
      const refused = cause instanceof UiControlError && ['protected', 'sensitive', 'killed', 'invalid', 'stale-ref', 'unknown-ref', 'not-actionable'].includes(cause.code)
      this.deps.audit.record({ at: new Date().toISOString(), tool: verb, ...(window === undefined ? {} : { window }), outcome: refused ? 'refused' : 'failed', detail: code, approval })
      throw cause
    }
  }

  /**
   * Who lists and removes the app's plugins: plugin-share where the app has it, as it knows where each pulled plugin came from and is the one app service
   * the frame's host reaches (extensions stays in the app's own realm there); extensions elsewhere.
   */
  private installed(): Pick<ExtensionsPort, 'list' | 'remove'> | undefined {
    return this.deps.pluginShare?.() ?? this.deps.extensions()
  }

  private async plugin<Port = ExtensionsPort>(run: (plugins: Port) => unknown, mutates = true, port: Port | undefined = this.deps.extensions() as Port | undefined): Promise<VerbAnswer> {
    const extensions = port
    if (extensions === undefined) throw new DoorError('unavailable', 'this door has no extensions plugin to drive. In ACRYL\'s frame none is needed: a saved change in src/ or plugins/ reloads the app by itself, so do not restart it. Elsewhere, the app has no way to install plugins while it runs')
    const value = await run(extensions)
    // The app changed under the open pages: reload them (not when the plugin was already as it should be), and answer once they are back.
    const unchanged = typeof value === 'object' && value !== null && (value as { action?: unknown }).action === 'unchanged'
    if (mutates && !unchanged && this.deps.reloadOnChange !== false) await this.deps.channel.reloadAll()
    return { value, text: JSON.stringify(value, null, 2) }
  }

  private share(): PluginSharePort {
    const share = this.deps.pluginShare?.()
    if (share === undefined) throw new DoorError('unavailable', 'plugin-share is not running in this app. If the app just changed it is restarting, so try again in a moment. An app made by an older version does not have it, and upgrade does not add it: run `npx acrylblends add plugin-share` and follow its README')
    return share
  }

  /** Only a plan: no argument of any verb can publish, so an agent never says yes for a person. */
  private async planPublish(input: Record<string, unknown>): Promise<VerbAnswer> {
    const { name, owner, license } = input
    if (typeof name !== 'string' || name === '') throw new DoorError('invalid', 'plugin publish needs a plugin name, e.g. plugin publish pomodoro')
    const value = await this.share().planPublish(name, {
      ...(typeof owner === 'string' && owner !== '' ? { owner } : {}),
      ...(typeof license === 'string' && license !== '' ? { license } : {}),
    })
    if ('ok' in value) throw new DoorError('refused', `${value.reason}. ${value.next}.`)
    return { value, text: `${renderPublishPlan(value)}\nNothing was sent. Only a person can say yes: they run \`npm run acryl -- plugin publish ${name}\` in their own terminal, or press Share in the frame. \`--license <id>\` changes the license before the yes.` }
  }

  /** The person's yes, from their own terminal. Not a verb: MCP and the chat do not have it. */
  async publishConfirmed(name: string, confirmed: PublishPlanView, options: PublishOptionsView): Promise<unknown> {
    const value = await this.share().publish(name, confirmed, options)
    this.deps.audit.record({ at: new Date().toISOString(), tool: 'plugin-publish', target: { role: 'plugin', name: `${confirmed.owner}/${confirmed.repo}@${confirmed.version}` }, outcome: value.ok ? 'ok' : 'refused', approval: 'token' })
    return value
  }

  private async pull(source: unknown): Promise<VerbAnswer> {
    if (typeof source !== 'string' || source === '') throw new DoorError('invalid', 'plugin pull needs a source, e.g. plugin pull github:someone/pomodoro@0.1.0')
    const value = await this.share().pull(source)
    // A refusal is a failed command, so a script does not read it as done; it changed nothing, and the open pages stay.
    if (!value.ok) throw new DoorError('refused', `${sentence(value.reason ?? 'the pull was refused')} ${sentence(value.next ?? 'nothing changed')}`)
    // Neither did pulling what is already there change anything.
    if (value.action !== 'unchanged' && this.deps.reloadOnChange !== false) await this.deps.channel.reloadAll()
    return { value, text: JSON.stringify(value, null, 2) }
  }

  /** A group's list: every source is pulled on its own, so one refused plugin is named with its reason and the others still install and run. */
  private async pullList(from: unknown, source: unknown): Promise<VerbAnswer> {
    if (source !== undefined) throw new DoorError('invalid', 'plugin pull takes a source or --from <list>, not both')
    if (typeof from !== 'string' || from === '') throw new DoorError('invalid', 'plugin pull --from needs a list, e.g. plugin pull --from group.txt')
    const value = await this.share().pullList(from)
    if (!value.ok) throw new DoorError('refused', `${sentence(value.reason)} ${sentence(value.next)}`)
    const changed = value.entries.some(entry => entry.result.ok && entry.result.action !== 'unchanged')
    if (changed && this.deps.reloadOnChange !== false) await this.deps.channel.reloadAll()
    const lines = value.entries.map(entry => `${entry.source}: ${pullLine(entry.result)}`)
    const refused = value.entries.filter(entry => !entry.result.ok)
    const summary = `${String(value.entries.length - refused.length)} of ${String(value.entries.length)} from ${value.from} pulled`
    // Some refused: the command failed, so a script sees it, but the ones that came in stay in and keep running.
    if (refused.length > 0) throw new DoorError('refused', [`${summary}; ${String(refused.length)} refused, the others are in and running.`, ...lines].join('\n'))
    return { value, text: [`${summary}.`, ...lines].join('\n') }
  }

  /** A folder named by an agent, resolved from the app folder; it must be inside the app. */
  private insideApp(folder: unknown): string {
    if (typeof folder !== 'string' || folder === '') throw new DoorError('invalid', 'plugin add needs a folder, e.g. plugins/pomodoro')
    const root = this.deps.app.root
    const full = resolve(root, folder)
    const path = relative(root, full)
    if (path === '' || path.startsWith('..') || isAbsolute(path)) throw new DoorError('outside-app', `${folder} is not a folder inside the app (${root})`)
    return full
  }

  private offeredTools(): Array<{ name: string; description: string }> {
    const tools = this.deps.tools()
    if (tools === undefined) return []
    const allowed = new Set(this.deps.expose)
    return tools.list().filter(tool => allowed.has(tool.name)).map(({ name, description }) => ({ name, description }))
  }

  private async callTool(input: Record<string, unknown>): Promise<VerbAnswer> {
    const name = input.tool
    if (typeof name !== 'string' || name === '') throw new DoorError('invalid', 'tool call needs --tool <name>')
    if (!this.deps.expose.includes(name)) throw new DoorError('not-exposed', `${name} is not offered through the door`)
    const tools = this.deps.tools()
    if (tools === undefined || !tools.list().some(tool => tool.name === name)) throw new DoorError('unavailable', `${name} is not available right now`)
    let value: unknown
    try {
      value = await tools.call(name, input.args ?? {})
    } catch (cause) {
      throw new DoorError('failed', cause instanceof Error ? cause.message : String(cause))
    }
    return { value, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }
  }
}

/** One source's outcome in a list pull, as a person reads it. */
function pullLine(result: PullView): string {
  if (!result.ok) return `refused: ${sentence(result.reason ?? 'the pull was refused')} ${sentence(result.next ?? 'nothing changed')}`
  return `${result.action ?? 'pulled'}${result.name === undefined ? '' : ` ${result.name}`}`
}

/** A text as one sentence: the full stop added only when it has no closing punctuation of its own (a reason may end with one, a next step often does). */
function sentence(text: string): string {
  const trimmed = text.trim()
  return /[.!?]$/u.test(trimmed) ? trimmed : `${trimmed}.`
}
