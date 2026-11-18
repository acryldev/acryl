/**
 * Settings → Plugins (docs/design/blends-frame-mockup.html): everything the app is made of, in one list, all read from the frame's Host: the
 * app's plugins (`blend.yaml` rows and what was written into `plugins/`) and the frame's own Loader rows. A switch writes where the plugin is
 * chosen; the Host then starts the app's plugins again, and the canvas loads the app page again.
 */

import { failureOf } from './plain-failure.ts'
import { FRAME_PLUGINS_PATH, FRAME_PLUGINS_SAVE_PATH, FRAME_PLUGINS_SHARE_PATH, FRAME_PLUGINS_SHARE_PLAN_PATH, FRAME_PLUGINS_SWITCH_PATH, parseAppPluginsView, parseSavedPlugin, parseSharePlan, type AppPluginKind, type AppPluginsView, type AppPluginView, type FramePluginView, type SavedPluginResult, type SavedPluginView, type ShareVisibility, type SharedPluginView, type SharePlan } from '../contract.ts'

/** Where a share goes: a private repository (the team), a public one (everyone), or a public one the registry lists. */
export type ShareTarget = ShareVisibility | 'registry'

/** Sharing a local plugin: first what it would do, then, on the person's yes, exactly that. */
export interface PluginShare {
  plan(target?: ShareTarget): Promise<SharePlan>
  publish(confirmed: SharePlan): Promise<SharedPluginView>
}

/** What the person can do with one local plugin besides sharing it: keep a packed copy on this machine, and look at its code. */
export interface PluginActions {
  /** Keep a packed copy in this app's plugin store; nothing leaves the machine. */
  readonly save?: () => Promise<SavedPluginResult>
  /** Open the plugin's main file in the Files tab. Absent when the file is outside the app. */
  readonly viewSource?: () => void
}

/** The command another app runs to take a shared plugin, from its repository address and version. */
export function pullCommand(shared: SharedPluginView): string | undefined {
  const where = /^https:\/\/github\.com\/([^/]+)\/([^/#?]+)/u.exec(shared.url)
  return where === null ? undefined : `npm run acryl -- plugin pull github:${where[1] ?? ''}/${where[2] ?? ''}@${shared.version}`
}

/** What to send a colleague so they can add a shared plugin: the address the Registry tab's "Add by address" takes. */
export function colleagueAddress(shared: SharedPluginView): string | undefined {
  const where = /^https:\/\/github\.com\/([^/]+)\/([^/#?]+)/u.exec(shared.url)
  return where === null ? undefined : `github:${where[1] ?? ''}/${where[2] ?? ''}@${shared.version}`
}

/**
 * The question a share asks before anything is sent, in plain words: who will be able to use the plugin, and (for a repeated share) that this is the next
 * version. Nothing technical: the repository, license and labels are in {@link shareDetails}.
 */
export function shareQuestion(plan: SharePlan): string {
  const name = plan.repo
  const who = plan.registry === true
    ? `List ${name} in the public registry? Anyone can search for it and add it with one click.`
    : plan.visibility === 'public'
      ? `Share ${name} with everyone? Anyone can find it and add it to their own app.`
      : `Share ${name} with your team? Only people you invite can add it.`
  const next = plan.released === undefined ? '' : ` This sends version ${plan.version}, because ${plan.released} was already shared.`
  return `${who} It is kept on your GitHub account, ${plan.owner}.${next}`
}

/** The words on the one big button that confirms a share. */
export function shareButton(plan: SharePlan): string {
  return plan.registry === true ? 'List in the registry' : plan.visibility === 'public' ? 'Share with everyone' : 'Share with my team'
}

/** The exact sentence of what a share does, for the "Details" of the confirmation: the repository, whether it is created, the version and who can see it. */
export function shareSentence(plan: SharePlan): string {
  const where = `${plan.owner}/${plan.repo}`
  const what = plan.createsRepository
    ? `Create repository ${where} on GitHub and publish v${plan.version}?`
    : `Publish v${plan.version} to ${where} on GitHub?`
  const released = plan.released === undefined ? '' : ` v${plan.released} is released there, so this is the next version.`
  const who = plan.visibility === 'public' ? `public, under the ${plan.license ?? 'MIT'} license: anyone can read it and pull it into their own app` : 'private'
  const listed = plan.registry === true ? ' It will be listed in the public Cordis plugin registry.' : ''
  return `${what}${released} It will be ${who}.${listed}`
}

/** What a developer wants to see behind "Details": where it goes and under what terms. One short line each. */
export function shareDetails(plan: SharePlan): string[] {
  return [
    shareSentence(plan),
    `Repository: ${plan.owner}/${plan.repo} on GitHub (${plan.createsRepository ? 'a new one' : 'it exists'}), ${plan.visibility}`,
    ...(plan.license === undefined ? [] : [`License: ${plan.license}`]),
    ...(plan.registry === true ? ['Topic: cordis-plugin, which cordisplugins.github.io lists within about an hour'] : []),
  ]
}

/** Which filter chip a plugin falls under. */
export type PluginGroup = 'made' | 'registry' | 'frame'

export interface NavigatorPlugin {
  /** Unique across groups: `app:<name>` or `frame:<entryId>`. */
  readonly key: string
  readonly name: string
  readonly group: PluginGroup
  /** The badge: who made it ("Claude · today"), "registry", "frame". */
  readonly by: string
  readonly description: string
  readonly on: boolean
  /** Shown after the description: "active", "off", "not saved yet", "failed". */
  readonly state: string
  /** Where a local plugin was shared: its repository and released version. */
  readonly shared?: SharedPluginView
  /** The newest packed copy kept on this machine. */
  readonly saved?: SavedPluginView
  /** Absolute path of the plugin's folder, shown small on the card. */
  readonly folder?: string
  /** What the person can do with it besides share it (save here, view the code). */
  readonly actions?: PluginActions
  /** Publish this local plugin so another app can install it, after the person confirms its plan. Absent when the row cannot be shared here. */
  readonly share?: PluginShare
  /** Absent when the plugin cannot be switched here (the frame's protected rows). */
  readonly toggle?: (on: boolean) => Promise<void>
}

const DAY_MS = 86_400_000

/** "today", "yesterday", "Mon", or "12 Oct" for an older day. */
export function madeWhen(at: string, now: Date = new Date()): string {
  const when = new Date(at)
  if (Number.isNaN(when.getTime())) return ''
  const day = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  const days = Math.round((day(now) - day(when)) / DAY_MS)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return when.toLocaleDateString('en', { weekday: 'short' })
  return when.toLocaleDateString('en', { day: 'numeric', month: 'short' })
}

export function appPluginRow(plugin: AppPluginView, toggle: (on: boolean) => Promise<void>, share?: PluginShare, now?: Date, actions?: PluginActions): NavigatorPlugin {
  const made = plugin.kind === 'made'
  const by = made
    ? plugin.by === undefined ? 'not saved yet' : [plugin.by, plugin.at === undefined ? '' : madeWhen(plugin.at, now)].filter(part => part !== '').join(' · ')
    : plugin.version === undefined ? 'registry' : `registry · v${plugin.version}`
  return {
    key: `app:${plugin.name}`,
    name: plugin.name,
    group: made ? 'made' : 'registry',
    by,
    description: plugin.description,
    on: plugin.on,
    state: plugin.on ? 'active' : 'off',
    ...(plugin.shared === undefined ? {} : { shared: plugin.shared }),
    ...(plugin.saved === undefined ? {} : { saved: plugin.saved }),
    ...(plugin.folder === undefined ? {} : { folder: plugin.folder }),
    ...(actions === undefined ? {} : { actions }),
    ...(made && share !== undefined ? { share } : {}),
    toggle,
  }
}

const FRAME_STATE_LABEL: Record<FramePluginView['state'], string> = { active: 'active', waiting: 'waiting for a service', failed: 'failed', off: 'off' }

/** One of the frame's own plugins: shown with its state, switched only by changing the frame. */
export function framePluginRow(plugin: FramePluginView, actions?: PluginActions): NavigatorPlugin {
  return {
    key: `frame:${plugin.id}`,
    name: plugin.name,
    group: 'frame',
    by: plugin.version === undefined ? 'frame' : `frame · v${plugin.version}`,
    description: plugin.description,
    on: plugin.state !== 'off',
    state: FRAME_STATE_LABEL[plugin.state],
    ...(plugin.folder === undefined ? {} : { folder: plugin.folder }),
    ...(actions === undefined ? {} : { actions }),
  }
}

/** The plugins a search and a chip leave. */
export function filterPlugins(plugins: readonly NavigatorPlugin[], query: string, group: PluginGroup | 'all'): NavigatorPlugin[] {
  const needle = query.trim().toLowerCase()
  return plugins.filter(plugin => (group === 'all' || plugin.group === group)
    && (needle === '' || plugin.name.toLowerCase().includes(needle) || plugin.description.toLowerCase().includes(needle) || plugin.by.toLowerCase().includes(needle)))
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface AppPluginsApi {
  read(): Promise<AppPluginsView>
  switch(kind: AppPluginKind, name: string, on: boolean): Promise<void>
  /** What sharing one local plugin would do (private unless `visibility` says public); nothing is sent. */
  planShare(name: string, target?: ShareTarget): Promise<SharePlan>
  /** Share one local plugin as the person confirmed it; answers where it went. */
  share(name: string, confirmed: SharePlan): Promise<SharedPluginView>
  /** Keep a packed copy of one local plugin on this machine. */
  save(name: string): Promise<SavedPluginResult>
}

const errorOf = async (response: Response): Promise<never> => { throw await failureOf(response) }

export function createAppPluginsApi(fetcher: FetchLike = (input, init) => fetch(input, init)): AppPluginsApi {
  return {
    async read() {
      const response = await fetcher(FRAME_PLUGINS_PATH, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } })
      if (!response.ok) return errorOf(response)
      return parseAppPluginsView(await response.json())
    },
    async switch(kind, name, on) {
      const response = await fetcher(FRAME_PLUGINS_SWITCH_PATH, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ kind, name, on }),
      })
      if (!response.ok) return errorOf(response)
    },
    async planShare(name, target) {
      const response = await fetcher(FRAME_PLUGINS_SHARE_PLAN_PATH, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(target === undefined ? { name } : target === 'registry' ? { name, registry: true } : { name, visibility: target }),
      })
      if (!response.ok) return errorOf(response)
      return parseSharePlan(await response.json())
    },
    async save(name) {
      const response = await fetcher(FRAME_PLUGINS_SAVE_PATH, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!response.ok) return errorOf(response)
      return parseSavedPlugin(await response.json())
    },
    async share(name, confirmed) {
      const response = await fetcher(FRAME_PLUGINS_SHARE_PATH, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ name, confirm: confirmed }),
      })
      if (!response.ok) return errorOf(response)
      const body = await response.json() as Record<string, unknown>
      if (typeof body['url'] === 'string' && typeof body['version'] === 'string') return { url: body['url'], version: body['version'] }
      throw new Error('the share answered without its repository')
    },
  }
}
