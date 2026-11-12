/**
 * Sharing a plugin between people: `pull(source)` turns a release someone published into a running plugin in this app. It fetches without running
 * anything, decides from the package's files (`pull-check.ts`), and hands a folder to `extensions`, which owns the install and its rollback.
 * Design: docs/plans/plugin-share.md.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { type Context, Service } from '@deepseek-ai/cordis'
import { findSecrets } from '@webboxes/app-persistence'
import { digestFolder, type PluginFile } from '@webboxes/blends-core'
import {
  bumpVersion,
  gitCli,
  githubCli,
  githubReleasesOverHttps,
  httpsDownload,
  InvalidPluginSourceError,
  type PluginSource,
  PluginStore,
  PullError,
  packFolder,
  parsePluginSource,
  pullPlugin,
  type ReleasePort,
  readTarball,
  sharePlugin,
  storeRootOf,
} from '@webboxes/plugin-hub'
import { type ExtensionInfo, NAME } from '../extensions/index.ts'
import type {} from '../instance/index.ts'
import { LOCK_FILE, writeLock } from '../manifest/lock.ts'
import { packagePlugin } from './package.ts'
import {
  type PublishOptions,
  type PublishPlan,
  type PublishPorts,
  type PublishRefused,
  type PublishResult,
  pullLineOf,
  samePlan,
} from './publish.ts'
import {
  missingServices,
  type PullRefused,
  pullRefusal,
  refuse,
  splitDigest,
} from './pull-check.ts'
import { LIST_MAX_BYTES, parsePullList, pullListLocation } from './pull-list.ts'
import { type PulledRecord, pulledRecords, withPulledRecord } from './pulled-records.ts'

export type {
  PublishOptions,
  PublishPlan,
  PublishPorts,
  PublishRefused,
  PublishResult,
} from './publish.ts'

/** One remembered plugin the app fetched again at its start because its folder was gone. */
export type RestoreOutcome =
  | { readonly name: string; readonly ok: true }
  | { readonly name: string; readonly ok: false; readonly reason: string; readonly next: string }

export interface PluginShareConfig {
  /** Where pulled plugins go; must be an extensions source. Defaults to `<project>/plugins`. */
  dir?: string
  /** Where a `github:` source reads releases. Defaults to GitHub over HTTPS. */
  releases?: ReleasePort
  /** Where a publish goes. Defaults to the person's own `gh` and `git`. */
  publish?: PublishPorts
  /** How an https address is read: a release `.tgz` and a list of sources. Defaults to HTTPS with the hub's size and time limits. */
  download?: (url: string) => Promise<Uint8Array>
}

export type PullResult =
  | {
      readonly ok: true
      readonly name: string
      readonly version: string
      /** The sha512 of the release's tarball, as the registry lists it. */
      readonly integrity: string
      /** The sha256 of the plugin's content: the same on every OS. A source can name it (`@sha256:<digest>`). */
      readonly digest: string
      readonly action: 'installed' | 'updated' | 'unchanged'
      readonly state: string
      /** Whether the app's `blend.yaml` and lock now name this source, so a copy of the app can fetch it. A local file names nothing to fetch. */
      readonly remembered: boolean
    }
  | PullRefused

/** One source of a list and what pulling it did. */
export interface PullListEntry {
  /** Its line in the list. */
  readonly line: number
  readonly source: string
  readonly result: PullResult
}

/** A list pulled: every source with its own result (some may be refused while the others install), or the list itself refused. */
export type PullListResult =
  | { readonly ok: true; readonly from: string; readonly entries: readonly PullListEntry[] }
  | PullRefused

/** One plugin installed while the app runs, as a person reads the list: what it is and, for one pulled, where it came from and who released it. */
/** What extensions says about an installed plugin (its state, the services a pending one waits for, ...), and where a pulled one came from. */
export interface SharedPluginInfo extends ExtensionInfo {
  /** The source it was pulled from (`github:<owner>/<repo>@<version>` or an address); absent for one made in this app or pulled from a local file. */
  readonly pulledFrom?: string
  /** Who released it: the account of a `github:` source or of a release address on github.com. */
  readonly author?: string
  /** The version its `package.json` names (`version` is the installed content's short digest); absent without one. */
  readonly release?: string
}

/** What removing a plugin did with its folder in `plugins/`. */
export type RemovedFolder =
  /** It held the release as pulled, so nothing of anyone's is lost: the pull line brings it back. */
  | 'deleted'
  /** It is this app's own work, or a pulled plugin changed after the pull: it stays, and the app starts it again at its next start. */
  | 'kept'
  | 'none'

export type SharedRemoveResult =
  | {
      readonly ok: true
      readonly name: string
      readonly folder: RemovedFolder
      readonly note?: string
    }
  | { readonly ok: false; readonly name: string; readonly errors: readonly string[] }

declare module '@deepseek-ai/cordis' {
  interface Context {
    pluginShare: PluginShare
  }
}

/** The account that released a source: the owner of a `github:<owner>/<repo>@<version>` source or of a release address on github.com. */
const authorOf = (source: string): string | undefined =>
  (/^github:([^/]+)\//u.exec(source) ?? /^https:\/\/github\.com\/([^/]+)\//u.exec(source))?.[1]

/** The version a plugin folder's `package.json` names, when it names a plain one. */
function releaseOf(folder: string): string | undefined {
  try {
    const version = (
      JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8')) as { version?: unknown }
    ).version
    return typeof version === 'string' && /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.+-]+)?$/u.test(version)
      ? version
      : undefined
  } catch {
    return undefined
  }
}

/** The license a new public plugin is offered under; the plan shows it before the person says yes. */
const DEFAULT_LICENSE = 'MIT'
const LICENSE_ID = /^[A-Za-z0-9][A-Za-z0-9.+-]*$/u

const publishRefused = (reason: string, next: string): PublishRefused => ({
  ok: false,
  reason,
  next,
})

const SOURCE_FORMS = 'github:<owner>/<repo>[@<version>] or a .tgz path or address'

/** Read what a person wrote. A `.tgz` path may be relative to the app folder; the hub only takes absolute ones. */
function readSource(
  input: string,
  root: string,
): { readonly source: PluginSource; readonly digest?: string } {
  const { source, digest } = splitDigest(input.trim())
  const isLocalTarball = /\.(?:tgz|tar\.gz)$/iu.test(source) && !/^[a-z][a-z0-9+]+:/iu.test(source)
  const parsed = parsePluginSource(isLocalTarball ? resolve(root, source) : source)
  if (parsed.kind !== 'github' && parsed.kind !== 'tarball-file' && parsed.kind !== 'tarball-url') {
    const named = parsed.kind === 'name' ? 'a bare name' : parsed.kind
    throw new InvalidPluginSourceError(
      input,
      `${named} sources are not offered here; pull ${SOURCE_FORMS}`,
    )
  }
  return { source: parsed, ...(digest === undefined ? {} : { digest }) }
}

/** The source as another machine can fetch it: the version pinned; a file on this machine names nothing. */
function recordedSource(source: PluginSource, version: string): string | undefined {
  if (source.kind === 'github') return `github:${source.owner}/${source.repo}@${version}`
  return source.kind === 'tarball-url' ? source.url : undefined
}

const reasonOf = (cause: unknown): string => {
  if (cause instanceof PullError || cause instanceof InvalidPluginSourceError) return cause.reason
  return cause instanceof Error ? cause.message : String(cause)
}

export class PluginShare extends Service {
  /** What was fetched again at this start. */
  readonly restored: Promise<readonly RestoreOutcome[]>
  private readonly dir: string
  private readonly releases: ReleasePort
  private readonly download: (url: string) => Promise<Uint8Array>
  private readonly ports: PublishPorts
  /** One at a time: two pulls of one name must not race for its folder, nor two publishes for its package. */
  private queue: Promise<unknown> = Promise.resolve()
  /** The content digest of each plugin pulled while the app runs, a local file's too, which `blend.yaml` does not remember. */
  private readonly live = new Map<string, string>()

  /**
   * The context the service was constructed with, in the app's realm. Inside a service method `this.ctx` is Cordis's shadow context of the caller: in the
   * frame that is the host's door, which does not see the app's own services (`home`), so a plugin needing them was refused. As `extensions` does.
   */
  private readonly own: Context

  constructor(ctx: Context, config: PluginShareConfig) {
    super(ctx, 'pluginShare')
    this.own = ctx
    this.dir = resolve(config.dir ?? join(ctx.appInstance.root, 'plugins'))
    this.releases = config.releases ?? githubReleasesOverHttps()
    this.download = config.download ?? httpsDownload()
    this.ports = config.publish ?? { host: githubCli(), git: gitCli() }
    // Removing a plugin removes its record. Listened to here, not asked of each caller: every way of removing it goes through extensions.
    ctx.on('extensions/changed', (name, change) => {
      if (change !== 'removed') return
      this.live.delete(name)
      this.remember(name, undefined)
    })
    // Not awaited by the app's start: a person offline still gets their app, and the warning says what is missing.
    this.restored = this.inTurn(() => this.restore())
  }

  /** Pull a plugin into the running app. Never throws for what a person can act on: a refusal says what is wrong and what to do, and changes nothing. */
  pull(source: string): Promise<PullResult> {
    return this.inTurn(() => this.pullNow(source))
  }

  /**
   * Pull every source of a list, a file in the app or an https address (a gist, a file in the group's repository): one after the other and each on
   * its own, so a source that is refused, or clashes with a plugin already here, is reported with its reason while the others install and keep running.
   * A list that cannot be read, or has a line that is not one source, pulls nothing.
   */
  async pullList(from: string): Promise<PullListResult> {
    const text = await this.readList(from)
    if (typeof text !== 'string') return text
    const { sources, problems } = parsePullList(text)
    if (problems.length > 0)
      return refuse('list', `${from}: ${problems.join('; ')}`, 'fix the list; nothing was pulled')
    if (sources.length === 0)
      return refuse(
        'list',
        `${from} names no plugin`,
        'write one source per line, e.g. github:someone/pomodoro@0.1.0',
      )
    const entries: PullListEntry[] = []
    for (const { line, source } of sources)
      entries.push({ line, source, result: await this.pull(source) })
    return { ok: true, from, entries }
  }

  /** The text of a list, or why it cannot be read. */
  private async readList(from: string): Promise<string | PullRefused> {
    const where = pullListLocation(from)
    if (where === undefined)
      return refuse(
        'list',
        `"${from}" is not a list`,
        'name a file in the app (e.g. group.txt) or an https address of one',
      )
    try {
      let bytes: Uint8Array
      if (where.kind === 'address') bytes = await this.download(where.url)
      else {
        const path = resolve(this.own.appInstance.root, where.path)
        if (!existsSync(path) || !statSync(path).isFile())
          return refuse(
            'list',
            `there is no file ${where.path}`,
            'name a file in the app, or an https address',
          )
        bytes = readFileSync(path)
      }
      if (bytes.length > LIST_MAX_BYTES)
        return refuse(
          'list',
          `${from} is larger than ${String(LIST_MAX_BYTES)} bytes, so it is not a list of plugins`,
          'name the list itself',
        )
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch (cause) {
      return refuse(
        'list',
        `${from} could not be read: ${reasonOf(cause)}`,
        'check the address; nothing was pulled',
      )
    }
  }

  /**
   * The content digest of a pulled plugin as it was installed: set before its folder appears, so whoever sees the folder change can tell the release as
   * pulled from an edit (the frame then does not load the app again for it). A pull from a local file has no record in `blend.yaml`; this knows it too.
   */
  pulledDigest(name: string): string | undefined {
    return this.live.get(name) ?? this.recorded(name)?.digest
  }

  /** The plugins installed while the app runs, each pulled one with its source and author. */
  list(): SharedPluginInfo[] {
    const file = join(this.own.appInstance.root, 'blend.yaml')
    const records = existsSync(file) ? pulledRecords(readFileSync(file, 'utf8')) : {}
    return this.own.extensions.list().map((info) => {
      const record = records[info.name]
      const author = record === undefined ? undefined : authorOf(record.source)
      const release = releaseOf(join(this.dir, info.name))
      return {
        ...info,
        ...(record === undefined ? {} : { pulledFrom: record.source }),
        ...(author === undefined ? {} : { author }),
        ...(release === undefined ? {} : { release }),
      }
    })
  }

  /**
   * Take a plugin out of the running app and forget its record. A pulled plugin's folder is deleted when it still holds the release as pulled; a
   * folder with someone's work in it (this app's own plugin, or a pulled one changed since) stays, and the answer says so.
   */
  remove(name: string): Promise<SharedRemoveResult> {
    return this.inTurn(() => this.removeNow(name))
  }

  private inTurn<T>(step: () => Promise<T>): Promise<T> {
    const run = this.queue.then(step)
    this.queue = run.catch(() => undefined)
    return run
  }

  /**
   * What publishing this plugin would do, read without sending anything. A plan is the only thing an agent can get: it never confirms for a person.
   */
  planPublish(name: string, options: PublishOptions = {}): Promise<PublishPlan | PublishRefused> {
    return this.inTurn(() => this.planNow(name, options))
  }

  /**
   * Publish exactly the plan a person said yes to: it is made again, and if anything differs (the plugin, the account, a release made meanwhile) nothing
   * is sent. Only the person's own surfaces call this: the frame's confirm and the terminal's prompt. No verb reaches it.
   */
  publish(
    name: string,
    confirmed: PublishPlan,
    options: PublishOptions = {},
  ): Promise<PublishResult> {
    return this.inTurn(async () => {
      const plan = await this.planNow(name, options)
      if ('ok' in plan) return plan
      if (!samePlan(plan, confirmed)) {
        return publishRefused(
          `this plugin's publish changed since you confirmed it (now ${plan.owner}/${plan.repo} v${plan.version}, digest ${plan.digest}); nothing was sent`,
          'look at the new plan and say yes again',
        )
      }
      const { home } = this.own.appInstance
      try {
        const shared = await sharePlugin(
          join(this.packages, name),
          {
            owner: plan.owner,
            repo: plan.repo,
            visibility: plan.visibility,
            kind: 'source-plugin',
          },
          { ...this.ports, store: new PluginStore(storeRootOf(home)) },
        )
        if (shared.status === 'refused')
          return publishRefused(shared.reason, 'fix what it names; nothing was sent')
        return {
          ok: true,
          url: shared.url,
          releaseUrl: shared.releaseUrl,
          version: shared.version,
          integrity: shared.integrity,
          digest: plan.digest,
          pullLine: plan.pullLine,
        }
      } catch (cause) {
        return publishRefused(
          reasonOf(cause),
          'look at the repository; part of this publish may have been sent',
        )
      }
    })
  }

  /** Write one plugin's record into `blend.yaml`, and the lock when the app has one, so the two still match. @returns whether the app holds the record. */
  private remember(name: string, record: PulledRecord | undefined): boolean {
    const { root } = this.own.appInstance
    const file = join(root, 'blend.yaml')
    if (!existsSync(file)) return false
    const text = readFileSync(file, 'utf8')
    const next = withPulledRecord(text, name, record)
    if (next !== text) {
      writeFileSync(`${file}.tmp`, next)
      renameSync(`${file}.tmp`, file)
      if (existsSync(join(root, LOCK_FILE))) writeLock(root)
    }
    return record === undefined || pulledRecords(next)[name] !== undefined
  }

  private async removeNow(name: string): Promise<SharedRemoveResult> {
    // Read before the removal, which forgets both the record and the live digest.
    const pulled = this.pulledDigest(name)
    const removed = await this.own.extensions.remove(name)
    if (!removed.ok) return removed
    const folder = join(this.dir, name)
    if (!existsSync(folder)) return { ok: true, name, folder: 'none' }
    if (pulled !== undefined && digestFolder(folder) === pulled) {
      rmSync(folder, { recursive: true, force: true })
      return { ok: true, name, folder: 'deleted' }
    }
    const why = pulled === undefined ? "is this app's own plugin" : 'was changed after the pull'
    return {
      ok: true,
      name,
      folder: 'kept',
      note: `plugins/${name} ${why}, so it stays and the app starts it again at its next start; delete the folder to drop it for good`,
    }
  }

  /** What `blend.yaml` remembers about one pulled plugin now. */
  private recorded(name: string): PulledRecord | undefined {
    const file = join(this.own.appInstance.root, 'blend.yaml')
    return existsSync(file) ? pulledRecords(readFileSync(file, 'utf8'))[name] : undefined
  }

  /** Fetch the remembered plugins whose folder is gone, exactly as recorded: other bytes are refused, and the record stays for the person to decide. */
  private async restore(): Promise<readonly RestoreOutcome[]> {
    const file = join(this.own.appInstance.root, 'blend.yaml')
    if (!existsSync(file)) return []
    const outcomes: RestoreOutcome[] = []
    for (const [name, record] of Object.entries(pulledRecords(readFileSync(file, 'utf8')))) {
      if (existsSync(join(this.dir, name))) continue
      const result = await this.pullNow(
        `${record.source}@sha256:${record.digest}`,
        record.integrity,
      )
      outcomes.push(
        result.ok
          ? { name, ok: true }
          : { name, ok: false, reason: result.reason, next: result.next },
      )
      if (!result.ok)
        console.warn(
          `plugin-share: ${name} was not fetched again: ${result.reason}. ${result.next}.`,
        )
    }
    return outcomes
  }

  private get packages(): string {
    return join(this.own.appInstance.home, 'plugin-packages')
  }

  private async planNow(
    name: string,
    options: PublishOptions,
  ): Promise<PublishPlan | PublishRefused> {
    const source = join(this.dir, name)
    if (!NAME.test(name) || !existsSync(source))
      return publishRefused(
        `this app has no plugin "${name}" in plugins/`,
        'name a folder of plugins/',
      )
    try {
      const { host } = this.ports
      const owner = options.owner ?? host.login()
      const repo = name
      const description = `The ${name} Cordis plugin.`
      const license = options.license ?? DEFAULT_LICENSE
      if (!LICENSE_ID.test(license))
        return publishRefused(
          `"${license}" is not a license id`,
          'write one such as MIT or Apache-2.0',
        )
      const release = { owner, repo, license }
      const existing = host.repository(owner, repo)
      let packaged = await packagePlugin(source, this.packages, name, description, { release })
      const released =
        existing !== undefined && host.releaseExists(owner, repo, `v${packaged.version}`)
          ? packaged.version
          : undefined
      if (released !== undefined)
        packaged = await packagePlugin(source, this.packages, name, description, {
          release,
          version: bumpVersion(released, 'patch'),
        })
      const secrets = findSecrets(
        readTarball(packFolder(packaged.dir).tarball).map((file) => ({
          path: file.path,
          text: Buffer.from(file.content).toString('utf8'),
        })),
      )
      if (secrets.length > 0) {
        return publishRefused(
          `the secret check found ${String(secrets.length)} possible secret(s) in ${secrets.map((secret) => secret.path).join(', ')}; nothing was sent`,
          "take them out of the plugin and read them from the app's settings",
        )
      }
      return {
        owner,
        repo,
        version: packaged.version,
        visibility: 'public',
        license,
        createsRepository: existing === undefined,
        ...(released === undefined ? {} : { released }),
        files: packaged.files,
        integrity: packaged.integrity,
        digest: packaged.digest,
        pullLine: pullLineOf(owner, repo, packaged.version, packaged.digest),
      }
    } catch (cause) {
      return publishRefused(reasonOf(cause), 'fix it, or sign in with gh; nothing was sent')
    }
  }

  private async pullNow(input: string, expectIntegrity?: string): Promise<PullResult> {
    const { home, root } = this.own.appInstance
    let read: ReturnType<typeof readSource>
    try {
      read = readSource(input, root)
    } catch (cause) {
      return refuse(
        'source',
        reasonOf(cause),
        `write ${SOURCE_FORMS}, with @sha256:<digest> at the end to name the content`,
      )
    }
    mkdirSync(home, { recursive: true })
    const scratch = mkdtempSync(join(home, 'plugin-pull-'))
    try {
      let pulled: Awaited<ReturnType<typeof pullPlugin>>
      try {
        pulled = await pullPlugin(
          read.source,
          {
            store: new PluginStore(scratch),
            releases: this.releases,
            download: this.download,
          },
          expectIntegrity === undefined ? {} : { expectIntegrity },
        )
      } catch (cause) {
        return refuse(
          'fetch',
          reasonOf(cause),
          'check the source with the person who released it; nothing was installed',
        )
      }
      const files: PluginFile[] = readTarball(readFileSync(pulled.stored.path)).map(
        ({ path, content }) => ({ path, bytes: content, kind: 'file' }),
      )
      const refused = pullRefusal(pulled.manifest, files, {
        digest: read.digest,
        nameFits: (name) => NAME.test(name),
        hasService: (service) => this.own.get(service as never) !== undefined,
      })
      if (refused !== undefined) return refused
      return await this.install(
        pulled.stored.name,
        pulled.stored.version,
        pulled.stored.integrity,
        files,
        recordedSource(read.source, pulled.stored.version),
      )
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  }

  /** Put the files in `plugins/<name>/` and install them; whatever does not end running takes its folder with it. */
  private async install(
    name: string,
    version: string,
    integrity: string,
    files: readonly PluginFile[],
    source: string | undefined,
  ): Promise<PullResult> {
    const target = join(this.dir, name)
    const incoming = join(this.dir, `.pulling-${name}`)
    rmSync(incoming, { recursive: true, force: true })
    try {
      for (const file of files) {
        const path = join(incoming, ...file.path.split('/'))
        mkdirSync(dirname(path), { recursive: true })
        writeFileSync(path, file.bytes)
      }
      const digest = digestFolder(incoming)
      // The folder may be there already: the same bytes are already pulled, anything else is someone's work.
      const wrote = !existsSync(target)
      const before = this.recorded(name)
      const held = wrote ? undefined : digestFolder(target)
      if (held !== undefined && held !== digest) {
        const holder = before === undefined ? 'made in this app' : `pulled from ${before.source}`
        // Only an untouched pulled copy goes with `plugin remove`; anything else is someone's work, which the person moves themselves.
        const next =
          before !== undefined && held === before.digest
            ? `keep it, or remove it (npm run acryl -- plugin remove ${name}) and pull again`
            : `keep it, or move plugins/${name} out of plugins/ and pull again`
        return refuse(
          'folder-exists',
          `plugins/${name} holds a different copy of this plugin, ${holder}`,
          next,
        )
      }
      const liveBefore = this.live.get(name)
      this.live.set(name, digest)
      if (wrote) renameSync(incoming, target)
      // Remembered as the folder appears, before it is installed, so whoever sees the folder can tell it is these released bytes (the frame then does
      // not load the app again for a plugin the app installs live); a pull that does not end running puts back what was remembered before.
      const remembered = source !== undefined && this.remember(name, { source, integrity, digest })
      const undo = () => {
        if (wrote) rmSync(target, { recursive: true, force: true })
        if (remembered) this.remember(name, before)
        if (liveBefore === undefined) this.live.delete(name)
        else this.live.set(name, liveBefore)
      }
      let result: Awaited<ReturnType<Context['extensions']['install']>>
      try {
        result = await this.own.extensions.install(target)
      } catch (cause) {
        undo()
        return refuse(
          'install',
          reasonOf(cause),
          'this app does not install plugins while it runs like this',
        )
      }
      if (!result.ok) {
        undo()
        return refuse('install', result.errors.join('; '), result.next)
      }
      if (result.state === 'pending') {
        await this.own.extensions.remove(name)
        undo()
        return missingServices(result.missing)
      }
      return {
        ok: true,
        name,
        version,
        integrity,
        digest,
        action: result.action,
        state: result.state,
        remembered,
      }
    } finally {
      rmSync(incoming, { recursive: true, force: true })
    }
  }
}

export const pluginShare = {
  name: 'plugin-share',
  inject: ['extensions', 'appInstance'],
  apply(ctx: Context, config: PluginShareConfig) {
    new PluginShare(ctx, config ?? {})
  },
}
