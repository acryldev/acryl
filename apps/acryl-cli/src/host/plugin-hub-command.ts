/**
 * `acryl plugin saved | save | version | pull`: the terminal face of the plugin hub (spec 044,
 * `specs/044-extension-persistence-and-registries/lifecycle.md`, "One service, four faces").
 *
 * The operations are `@webboxes/plugin-hub`'s `createPluginHub`, the same the `/plugin` chat command drives through the `acryl-plugin-hub`
 * plugin, so a result is the same from either face. `saved`, `save` and `version` touch only the app instance's store and the plugin's own
 * folder, so they need no engine. `pull` installs, which only the running profile's own installer (DSH's `pluginManager`) can do: it boots the
 * profile like `acryl plugin list`, and refuses while the app that owns the profile is live, as `enable` and `disable` do.
 *
 * @module acryl-cli/host/plugin-hub-command
 */

import { isAbsolute, resolve } from 'node:path'
import {
  createPluginHub, findSourceFolder, homePluginsDir, projectPluginsDir, firstReleasePort, githubReleasesOverHttps, githubReleasesViaGh, httpsDownload, npmRegistryOverHttps, PluginStore, storeRootOf,
  type InstallerPort, type PluginHub, type PullResult, type NpmPublishResult, type SaveResult, type ShareResult, type StoredVersion, type UpdateResult, type VersionBump, firstRegistryPort, gitCli, githubCli, npmCli, npmRegistryViaCli,
} from '@webboxes/plugin-hub'
import { processIsAlive, readLock, resolveAcrylDshHome, runLockFileForDshHome, selectInstance } from 'acryl-harness-runtime'
import { startDirectHost } from './direct.ts'

export type PluginHubAction = 'saved' | 'save' | 'version' | 'pull' | 'update' | 'share'

export interface PluginHubCommandOptions {
  readonly profile: string
  readonly action: PluginHubAction
  /** `save`/`version`: a plugin folder or the name of one; `pull`: the source. */
  readonly target?: string
  readonly bump?: VersionBump
  /** `share`: list it publicly, and the repository as `<owner>` or `<owner>/<repo>`. */
  readonly public?: boolean
  readonly to?: string
  /** `share`: publish to an npm registry instead (default the public one). */
  readonly npm?: boolean
  readonly registry?: string
  /** The folder relative paths and the project's `.acryl-plugins/` are read from. */
  readonly cwd?: string
}

export type PluginHubCommandResult =
  | { readonly kind: 'saved'; readonly store: string; readonly saved: readonly StoredVersion[] }
  | { readonly kind: 'save'; readonly store: string; readonly result: SaveResult }
  | { readonly kind: 'version'; readonly name: string; readonly from: string; readonly to: string; readonly folder: string }
  | { readonly kind: 'pull'; readonly profile: string; readonly result: PullResult }
  | { readonly kind: 'share'; readonly result: ShareResult }
  | { readonly kind: 'npm'; readonly result: NpmPublishResult }
  | { readonly kind: 'update'; readonly profile: string; readonly result: UpdateResult }

function storeHub(home: string, extra: { readonly has?: (service: string) => boolean; readonly installer?: () => InstallerPort | undefined } = {}): PluginHub {
  return createPluginHub({
    store: new PluginStore(storeRootOf(home)),
    releases: firstReleasePort(githubReleasesOverHttps(), githubReleasesViaGh()),
    registry: firstRegistryPort(npmRegistryOverHttps(), npmRegistryViaCli()),
    npm: npmCli(),
    download: httpsDownload(),
    has: extra.has ?? (() => true),
    installer: extra.installer ?? (() => undefined),
    share: { host: githubCli(), git: gitCli() },
  })
}

function folderOf(target: string | undefined, cwd: string, home: string): string {
  if (target === undefined || target === '') throw new Error('name the plugin: its folder, or its name under .acryl-plugins/')
  const asPath = isAbsolute(target) || target.startsWith('.') ? resolve(cwd, target) : undefined
  const roots = [projectPluginsDir(cwd), homePluginsDir(home)]
  const folder = findSourceFolder(asPath ?? target, roots)
  if (folder === undefined) throw new Error(`no plugin folder ${JSON.stringify(target)} (looked in ${asPath ?? roots.join(' and ')})`)
  return folder
}

export async function runPluginHubCommand(options: PluginHubCommandOptions): Promise<PluginHubCommandResult> {
  const instance = selectInstance()
  const cwd = options.cwd ?? process.cwd()
  if (options.action === 'saved') {
    const hub = storeHub(instance.home)
    return { kind: 'saved', store: hub.store.root, saved: hub.saved() }
  }
  if (options.action === 'save') {
    const hub = storeHub(instance.home)
    return { kind: 'save', store: hub.store.root, result: hub.save(folderOf(options.target, cwd, instance.home)) }
  }
  if (options.action === 'version') {
    if (options.bump === undefined) throw new Error('plugin version needs patch, minor or major')
    const folder = folderOf(options.target, cwd, instance.home)
    return { kind: 'version', folder, ...storeHub(instance.home).bump(folder, options.bump) }
  }
  if (options.action === 'share' && options.npm === true) {
    const folder = folderOf(options.target, cwd, instance.home)
    return { kind: 'npm', result: await storeHub(instance.home).publishNpm(folder, { ...(options.registry === undefined ? {} : { registry: options.registry }), ...(options.public === true ? { visibility: 'public' as const } : {}) }) }
  }
  if (options.action === 'share') {
    const folder = folderOf(options.target, cwd, instance.home)
    const [owner, repo] = (options.to ?? '').split('/')
    return {
      kind: 'share',
      result: await storeHub(instance.home).share(folder, {
        ...(owner === undefined || owner === '' ? {} : { owner }), ...(repo === undefined || repo === '' ? {} : { repo }), ...(options.public === true ? { visibility: 'public' as const } : {}),
      }),
    }
  }
  if (options.target === undefined && options.action === 'update') throw new Error('plugin update needs the plugin name')
  if (options.target === undefined) throw new Error('plugin pull needs a source: store:<name>, github:<owner>/<repo>[@version], npm:<name>, or a .tgz')
  const holder = readLock(runLockFileForDshHome(resolveAcrylDshHome()))
  if (holder !== undefined && processIsAlive(holder.pid)) {
    throw new Error(`the app running this profile (pid ${String(holder.pid)}) is live; ${options.action} from inside it (/plugin ${options.action} ${options.target}), or stop it first`)
  }
  const target = options.target.startsWith('.') ? resolve(cwd, options.target) : options.target
  const host = await startDirectHost({ profile: options.profile })
  try {
    const hub = storeHub(instance.home, {
      has: service => host.ctx.get(service as never) !== undefined,
      installer: () => host.ctx.get('pluginManager' as never) as InstallerPort | undefined,
    })
    if (options.action === 'update') return { kind: 'update', profile: options.profile, result: await hub.update(target) }
    return { kind: 'pull', profile: options.profile, result: await hub.pull(target) }
  } finally {
    await host.dispose()
  }
}

/** Lines for a person, or one JSON line; a refused or failed pull exits 1. */
export function renderPluginHubCommand(result: PluginHubCommandResult, json: boolean): { readonly lines: readonly string[]; readonly exitCode: number } {
  const failed = ((result.kind === 'share' || result.kind === 'npm') && result.result.status === 'refused') || (result.kind === 'update' && (result.result.status === 'not-updatable' || result.result.status === 'failed')) || result.kind === 'pull' && (result.result.status === 'missing-services' || result.result.status === 'install-failed' || result.result.status === 'cancelled')
  if (json) return { lines: [JSON.stringify(result)], exitCode: failed ? 1 : 0 }
  switch (result.kind) {
    case 'saved':
      return { lines: result.saved.length === 0 ? [`The plugin store (${result.store}) is empty.`] : result.saved.map(entry => `${entry.name} ${entry.version}  ${entry.integrity.slice(0, 19)}...  from ${entry.from}`), exitCode: 0 }
    case 'save':
      return { lines: [result.result.added ? `Saved ${result.result.name} ${result.result.version} (${String(result.result.files.length)} files) to ${result.store}.` : `${result.result.name} ${result.result.version} is already saved with exactly these files.`], exitCode: 0 }
    case 'version':
      return { lines: [`${result.name}: ${result.from} -> ${result.to} (${result.folder}).`], exitCode: 0 }
    case 'share': {
      const shared = result.result
      if (shared.status === 'refused') return { lines: [`Not shared: ${shared.reason}`, ...(shared.secrets ?? []).map(found => `  ${found.path}${found.line > 0 ? `:${String(found.line)}` : ''}  ${found.kind}`)], exitCode: 1 }
      return {
        lines: [
          `Shared ${shared.name} ${shared.version} to ${shared.visibility} ${shared.url}${shared.created ? ' (new repository)' : ''}: release ${shared.tag}, ${String(shared.files.length)} files, ${shared.integrity.slice(0, 19)}...`,
          ...(shared.updatedManifest.length === 0 ? [] : [`Updated its package.json: ${shared.updatedManifest.join('; ')}.`]),
          shared.visibility === 'public' ? 'Listed publicly: catalogs find it by its labels on their next refresh.' : 'Private: only the repository\'s collaborators can pull it. List it publicly with --public.',
        ],
        exitCode: 0,
      }
    }
    case 'npm': {
      const published = result.result
      if (published.status === 'refused') return { lines: [`Not published: ${published.reason}`, ...(published.secrets ?? []).map(found => `  ${found.path}${found.line > 0 ? `:${String(found.line)}` : ''}  ${found.kind}`)], exitCode: 1 }
      return {
        lines: [
          `Published ${published.name} ${published.version} to ${published.registry} (${published.access}), ${String(published.files.length)} files, ${published.integrity.slice(0, 19)}...`,
          ...(published.updatedManifest.length === 0 ? [] : [`Updated its package.json: ${published.updatedManifest.join('; ')}.`]),
        ],
        exitCode: 0,
      }
    }
    case 'update': {
      const updated = result.result
      switch (updated.status) {
        case 'updated': return { lines: [`Updated ${updated.name} ${updated.from ?? '?'} -> ${updated.to} in profile ${result.profile}, from ${updated.source}.`], exitCode: 0 }
        case 'restart-required': return { lines: [`Installed ${updated.name} ${updated.to} (was ${updated.from ?? '?'}); restart the app to load it.`], exitCode: 0 }
        case 'up-to-date': return { lines: [`${updated.name} ${updated.version} is the newest release of ${updated.source}.`], exitCode: 0 }
        case 'not-updatable': return { lines: [`Not updated: ${updated.reason}.`], exitCode: 1 }
        case 'failed': return renderPluginHubCommand({ kind: 'pull', profile: result.profile, result: updated.pull }, false)
      }
    }
    case 'pull': {
      const pulled = result.result
      const id = `${pulled.name} ${pulled.version}`
      const lines = pulled.status === 'installed' ? [`Installed ${id} into profile ${result.profile}, kept in the plugin store.`]
        : pulled.status === 'restart-required' ? [`Installed ${id}; restart the app to load this version.`]
          : pulled.status === 'stored' ? [`Kept ${id} in the plugin store${pulled.reason === undefined ? '' : `, not installed: ${pulled.reason}`}.`]
            : pulled.status === 'missing-services' ? [`Not installed: ${id} needs ${(pulled.missing ?? []).join(', ')}, which profile ${result.profile} does not provide. It is kept in the plugin store, so you can install it offline where those services exist, for example in the app's Web or Desktop chat: /plugin pull store:${pulled.name}@${pulled.version}`]
              : [`Not installed: ${id} (${pulled.outcome?.error?.code ?? pulled.status}).`, ...(pulled.outcome?.packageResult?.output.split('\n').slice(-5) ?? [])]
      return { lines, exitCode: failed ? 1 : 0 }
    }
  }
}
