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

import { isAbsolute, join, resolve } from 'node:path'
import {
  createPluginHub, findSourceFolder, githubReleasesOverHttps, httpsDownload, npmRegistryOverHttps, PluginStore, storeRootOf,
  type InstallerPort, type PluginHub, type PullResult, type SaveResult, type StoredVersion, type VersionBump,
} from '@webboxes/plugin-hub'
import { processIsAlive, readLock, resolveAcrylDshHome, runLockFileForDshHome, selectInstance } from 'acryl-harness-runtime'
import { startDirectHost } from './direct.ts'

export type PluginHubAction = 'saved' | 'save' | 'version' | 'pull'

export interface PluginHubCommandOptions {
  readonly profile: string
  readonly action: PluginHubAction
  /** `save`/`version`: a plugin folder or the name of one; `pull`: the source. */
  readonly target?: string
  readonly bump?: VersionBump
  /** The folder relative paths and the project's `.acryl-extensions/` are read from. */
  readonly cwd?: string
}

export type PluginHubCommandResult =
  | { readonly kind: 'saved'; readonly store: string; readonly saved: readonly StoredVersion[] }
  | { readonly kind: 'save'; readonly store: string; readonly result: SaveResult }
  | { readonly kind: 'version'; readonly name: string; readonly from: string; readonly to: string; readonly folder: string }
  | { readonly kind: 'pull'; readonly profile: string; readonly result: PullResult }

function storeHub(home: string, extra: { readonly has?: (service: string) => boolean; readonly installer?: () => InstallerPort | undefined } = {}): PluginHub {
  return createPluginHub({
    store: new PluginStore(storeRootOf(home)),
    releases: githubReleasesOverHttps(),
    registry: npmRegistryOverHttps(),
    download: httpsDownload(),
    has: extra.has ?? (() => true),
    installer: extra.installer ?? (() => undefined),
  })
}

function folderOf(target: string | undefined, cwd: string, home: string): string {
  if (target === undefined || target === '') throw new Error('name the plugin: its folder, or its name under .acryl-extensions/')
  const asPath = isAbsolute(target) || target.startsWith('.') ? resolve(cwd, target) : undefined
  const folder = findSourceFolder(asPath ?? target, [join(cwd, '.acryl-extensions'), join(home, 'extensions')])
  if (folder === undefined) throw new Error(`no plugin folder ${JSON.stringify(target)} (looked in ${asPath ?? `${join(cwd, '.acryl-extensions')} and ${join(home, 'extensions')}`})`)
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
  if (options.target === undefined) throw new Error('plugin pull needs a source: store:<name>, github:<owner>/<repo>[@version], npm:<name>, or a .tgz')
  const holder = readLock(runLockFileForDshHome(resolveAcrylDshHome()))
  if (holder !== undefined && processIsAlive(holder.pid)) {
    throw new Error(`the app running this profile (pid ${String(holder.pid)}) is live; pull from inside it (/plugin pull ${options.target}), or stop it first`)
  }
  const target = options.target.startsWith('.') ? resolve(cwd, options.target) : options.target
  const host = await startDirectHost({ profile: options.profile })
  try {
    const hub = storeHub(instance.home, {
      has: service => host.ctx.get(service as never) !== undefined,
      installer: () => host.ctx.get('pluginManager' as never) as InstallerPort | undefined,
    })
    return { kind: 'pull', profile: options.profile, result: await hub.pull(target) }
  } finally {
    await host.dispose()
  }
}

/** Lines for a person, or one JSON line; a refused or failed pull exits 1. */
export function renderPluginHubCommand(result: PluginHubCommandResult, json: boolean): { readonly lines: readonly string[]; readonly exitCode: number } {
  const failed = result.kind === 'pull' && (result.result.status === 'missing-services' || result.result.status === 'install-failed' || result.result.status === 'cancelled')
  if (json) return { lines: [JSON.stringify(result)], exitCode: failed ? 1 : 0 }
  switch (result.kind) {
    case 'saved':
      return { lines: result.saved.length === 0 ? [`The plugin store (${result.store}) is empty.`] : result.saved.map(entry => `${entry.name} ${entry.version}  ${entry.integrity.slice(0, 19)}...  from ${entry.from}`), exitCode: 0 }
    case 'save':
      return { lines: [result.result.added ? `Saved ${result.result.name} ${result.result.version} (${String(result.result.files.length)} files) to ${result.store}.` : `${result.result.name} ${result.result.version} is already saved with exactly these files.`], exitCode: 0 }
    case 'version':
      return { lines: [`${result.name}: ${result.from} -> ${result.to} (${result.folder}).`], exitCode: 0 }
    case 'pull': {
      const pulled = result.result
      const id = `${pulled.name} ${pulled.version}`
      const lines = pulled.status === 'installed' ? [`Installed ${id} into profile ${result.profile}, kept in the plugin store.`]
        : pulled.status === 'restart-required' ? [`Installed ${id}; restart the app to load this version.`]
          : pulled.status === 'stored' ? [`Kept ${id} in the plugin store${pulled.reason === undefined ? '' : `, not installed: ${pulled.reason}`}.`]
            : pulled.status === 'missing-services' ? [`Not installed: ${id} needs ${(pulled.missing ?? []).join(', ')}, which this app does not provide. It is kept in the plugin store.`]
              : [`Not installed: ${id} (${pulled.outcome?.error?.code ?? pulled.status}).`, ...(pulled.outcome?.packageResult?.output.split('\n').slice(-5) ?? [])]
      return { lines, exitCode: failed ? 1 : 0 }
    }
  }
}
