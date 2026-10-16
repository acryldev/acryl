/**
 * acryl-plugin-hub: saving, sharing and pulling plugins inside an app (spec 044, `specs/044-extension-persistence-and-registries/lifecycle.md`,
 * layer 2 over `@webboxes/plugin-hub`).
 *
 * Provides `pluginHub`, the one service every face drives (the `/plugin` chat command here, `acryl plugin` on the CLI, the agent tools and the
 * Plugins page later), so a result is the same whichever face asked:
 *
 *   saved()                          every version in this app instance's plugin store
 *   save(folder)                     pack a plugin you edit and keep that version
 *   pull(source, { install })        fetch, check the sha512, check the services the plugin needs against this app, keep it, install it
 *   bump(folder, 'patch'|...)        give a fix its new version
 *   installed()                      the profile's plugins as DSH's plugin manager lists them, with their versions
 *
 * The operations are `@webboxes/plugin-hub`'s `createPluginHub`; this plugin supplies the app's side of them.
 *
 * Installing is DSH's `pluginManager.installBundle` on the stored tarball (D1): the same installer stock DSH uses, with its compatibility check
 * and its approval of install scripts. This plugin never runs a package manager itself.
 *
 * Requires: `appInstance` (the home the store lives under). Optional: `pluginManager` (without it a pull only stores and says so) and
 * `commands` (the chat command).
 */
import { join } from 'node:path'
import { createPluginHub, findSourceFolder, githubReleasesOverHttps, httpsDownload, npmRegistryOverHttps, PluginStore, storeRootOf } from '@webboxes/plugin-hub'

export const name = 'acryl-plugin-hub'
export const inject = ['appInstance']

/** Where this app instance keeps its plugin store (`storeRootOf`: per instance, never machine-wide). */
export function storeRoot(instance) {
  return storeRootOf(instance.home)
}

/** Where plugins you edit live: the session's project folder, then the app instance's global one (SELF-EXTENSION-PERSISTENCE.md). */
export function sourceRoots({ workspaceDir, home }) {
  return [workspaceDir === undefined ? undefined : join(workspaceDir, '.acryl-extensions'), home === undefined ? undefined : join(home, 'extensions')]
}

const USAGE = 'Usage: /plugin list | saved | save <name or folder> | pull <source> | version patch|minor|major <name or folder>. A source is store:<name>[@version], github:<owner>/<repo>[@version], npm:<name>[@version], a .tgz file or https URL.'

function describePull(result) {
  const id = `${result.name} ${result.version}`
  switch (result.status) {
    case 'installed': return { kind: 'success', text: `Installed ${id} (${result.integrity.slice(0, 19)}...), kept in the plugin store.${result.contractChecked ? '' : ' It declares no service contract, so a missing service would only show as PENDING.'}` }
    case 'restart-required': return { kind: 'success', text: `Installed ${id}; restart the app to load this version.` }
    case 'stored': return { kind: 'success', text: `Kept ${id} in the plugin store${result.reason === undefined ? '' : `, not installed: ${result.reason}`}.` }
    case 'missing-services': return { kind: 'error', text: `Not installed: ${id} needs ${result.missing.join(', ')}, which this app does not provide. It is kept in the plugin store.` }
    default: return { kind: 'error', text: `Not installed: ${id} (${result.outcome?.error?.code ?? result.status}). ${result.outcome?.packageResult?.output?.split('\n').slice(-3).join(' ') ?? ''}`.trim() }
  }
}

/** The `/plugin` command's behaviour, apart from Cordis. */
export async function runPluginCommand(rawInput, hub, where) {
  const [verb = '', ...rest] = String(rawInput ?? '').trim().split(/\s+/u).filter(Boolean)
  try {
    if (verb === 'saved') {
      const saved = hub.saved()
      return { kind: 'success', text: saved.length === 0 ? 'The plugin store is empty. Save a plugin with /plugin save <name>.' : saved.map(entry => `${entry.name} ${entry.version}  from ${entry.from}`).join('\n') }
    }
    if (verb === 'list') {
      const installed = await hub.installed()
      const saved = hub.saved()
      const lines = installed === undefined ? ['Installed: not available here (DSH\'s plugin manager is not loaded).'] : ['Installed:', ...installed.map(entry => `  ${entry.name} ${entry.version ?? '(no version)'}${entry.enabled ? '' : '  (off)'}`)]
      lines.push(`Saved on this machine: ${saved.length === 0 ? 'none' : ''}`, ...saved.map(entry => `  ${entry.name} ${entry.version}`))
      return { kind: 'success', text: lines.join('\n') }
    }
    if (verb === 'save' || verb === 'version') {
      const bump = verb === 'version' ? rest.shift() : undefined
      if (verb === 'version' && !['patch', 'minor', 'major'].includes(bump)) return { kind: 'error', text: USAGE }
      const target = rest.join(' ')
      if (target === '') return { kind: 'error', text: USAGE }
      const folder = findSourceFolder(target, sourceRoots(where))
      if (folder === undefined) return { kind: 'error', text: `No plugin folder named ${JSON.stringify(target)} in this project's .acryl-extensions/ or the app's extensions/; give its absolute folder.` }
      if (verb === 'version') {
        const bumped = hub.bump(folder, bump)
        return { kind: 'success', text: `${bumped.name}: ${bumped.from} -> ${bumped.to}. Install it again to run it, and save or share it to keep the new version.` }
      }
      const saved = hub.save(folder)
      return { kind: 'success', text: saved.added ? `Saved ${saved.name} ${saved.version} (${saved.files.length} files) to the plugin store.` : `${saved.name} ${saved.version} is already saved with exactly these files.` }
    }
    if (verb === 'pull') {
      if (rest.length !== 1) return { kind: 'error', text: USAGE }
      return describePull(await hub.pull(rest[0]))
    }
  } catch (cause) {
    return { kind: 'error', text: String(cause?.message ?? cause) }
  }
  return { kind: 'error', text: USAGE }
}

export function apply(ctx) {
  const hub = createPluginHub({
    store: new PluginStore(storeRoot(ctx.appInstance)),
    releases: githubReleasesOverHttps(),
    registry: npmRegistryOverHttps(),
    download: httpsDownload(),
    has: service => ctx.get(service) !== undefined,
    installer: () => ctx.get('pluginManager'),
  })
  ctx.provide('pluginHub', hub)

  // Human-typed: a pull installs code that runs with the user's permissions, so the user's own command is the confirmation (D4); the agent
  // gets its own tools, which propose instead.
  ctx.inject(['commands'], scoped => {
    scoped.effect(() => scoped.commands.register({
      name: 'plugin',
      description: 'List, save, pull or version plugins (store:, github:owner/repo, npm:, a .tgz)',
      input: { hint: 'list | saved | save <name> | pull <source> | version patch <name>' },
      async handler(invocation) {
        return runPluginCommand(invocation?.rawInput, hub, { workspaceDir: invocation?.agent?.session?.header?.cwd, home: ctx.appInstance.home })
      },
    }), 'acryl-plugin-hub: /plugin command')
  })
}
