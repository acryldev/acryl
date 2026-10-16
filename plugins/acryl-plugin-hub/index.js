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
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createPluginHub, findSourceFolder, firstReleasePort, gitCli, githubCli, githubReleasesOverHttps, githubReleasesViaGh, httpsDownload, npmRegistryOverHttps, PluginStore, storeRootOf } from '@webboxes/plugin-hub'

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

const USAGE = 'Usage: /plugin list | saved | save <name or folder> | share <name or folder> [public] [owner/repo] | pull <source> | update <name> | version patch|minor|major <name or folder>. A source is store:<name>[@version], github:<owner>/<repo>[@version], npm:<name>[@version], a .tgz file or https URL.'

function describePull(result) {
  const id = `${result.name} ${result.version}`
  switch (result.status) {
    case 'installed': return { kind: 'success', text: `Installed ${id} (${result.integrity.slice(0, 19)}...), kept in the plugin store.${result.contractChecked ? '' : ' It declares no service contract, so a missing service would only show as PENDING.'}` }
    case 'restart-required': return { kind: 'success', text: `Installed ${id}; restart the app to load this version.` }
    case 'stored': return { kind: 'success', text: `Kept ${id} in the plugin store${result.reason === undefined ? '' : `, not installed: ${result.reason}`}.` }
    case 'missing-services': return { kind: 'error', text: `Not installed: ${id} needs ${result.missing.join(', ')}, which this app does not provide. It is kept in the plugin store (store:${result.name}@${result.version}), so it can be installed offline in an app that has those services.` }
    default: return { kind: 'error', text: `Not installed: ${id} (${result.outcome?.error?.code ?? result.status}). ${result.outcome?.packageResult?.output?.split('\n').slice(-3).join(' ') ?? ''}`.trim() }
  }
}

function describeUpdate(result) {
  switch (result.status) {
    case 'updated': return { kind: 'success', text: `Updated ${result.name} ${result.from} -> ${result.to} from ${result.source}.` }
    case 'restart-required': return { kind: 'success', text: `Installed ${result.name} ${result.to} (was ${result.from}); restart the app to load it.` }
    case 'up-to-date': return { kind: 'success', text: `${result.name} ${result.version} is the newest release of ${result.source}.` }
    case 'not-updatable': return { kind: 'error', text: `Not updated: ${result.reason}.` }
    default: return describePull(result.pull)
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
    if (verb === 'share') {
      // `/plugin share <name> [public] [owner[/repo]]`: typed by the user, so it is the user's confirmation (spec 044 guards).
      const isPublic = rest.includes('public')
      const words = rest.filter(word => word !== 'public')
      const target = words[0]
      if (target === undefined || words.length > 2) return { kind: 'error', text: USAGE }
      const folder = findSourceFolder(target, sourceRoots(where))
      if (folder === undefined) return { kind: 'error', text: `No plugin folder named ${JSON.stringify(target)} in this project's .acryl-extensions/ or the app's extensions/; give its absolute folder.` }
      const [owner, repo] = (words[1] ?? '').split('/')
      const result = await hub.share(folder, { ...(owner ? { owner } : {}), ...(repo ? { repo } : {}), ...(isPublic ? { visibility: 'public' } : {}) })
      if (result.status === 'refused') return { kind: 'error', text: `Not shared: ${result.reason}${(result.secrets ?? []).map(found => `\n- ${found.path}${found.line > 0 ? `:${found.line}` : ''} (${found.kind})`).join('')}` }
      return { kind: 'success', text: `Shared ${result.name} ${result.version} to ${result.visibility} ${result.url}${result.created ? ' (new repository)' : ''}: release ${result.tag}, ${result.files.length} files.${result.visibility === 'public' ? ' Catalogs list it by its labels on their next refresh.' : ' Only its collaborators can pull it; type /plugin share ' + target + ' public to list it.'}` }
    }
    if (verb === 'update') {
      if (rest.length !== 1) return { kind: 'error', text: USAGE }
      return describeUpdate(await hub.update(rest[0]))
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

/**
 * The agent's tool, one for every operation so it costs one definition in the prompt (spec 044 D4). Saving, versioning and pulling from the store stay on this machine and run directly. Sharing sends the user's
 * work, and a pull from anywhere else installs code that runs with the user's permissions, so both ask the user through DSH's approval service
 * first; only an explicit "allow once" proceeds, and with nobody to ask (a headless run, the "never" policy) they are refused.
 */
export function pluginTools(hub, { approval, where }) {
  const ask = async (exec, reason) => {
    const service = approval()
    if (service === undefined || exec?.agent === undefined) return 'unavailable'
    return service.request({ agent: exec.agent, toolName: 'acryl_plugins', ...(exec.callId === undefined ? {} : { callId: exec.callId }), reason, ...(exec.signal === undefined ? {} : { signal: exec.signal }) })
  }
  const folderOf = (exec, target) => {
    const folder = findSourceFolder(String(target ?? ''), sourceRoots(where(exec)))
    if (folder === undefined) throw new Error(`no plugin folder ${JSON.stringify(target)} in the project's .acryl-extensions/ or the app's extensions/; pass the ABSOLUTE folder`)
    return folder
  }
  const refusedBy = outcome => `the user did not allow it (${outcome}); tell them they can type the /plugin command themselves`
  return [defineTool({
    name: 'acryl_plugins',
    description: 'Save, version, share or pull plugins. share and non-store pulls ask the user first; if refused, give them the /plugin command.',
    parameters: {
      action: { type: 'string', required: true, enum: ['saved', 'save', 'version', 'pull', 'update', 'share'] },
      plugin: { type: 'string', description: 'Folder or name (save, version, share, update).' },
      bump: { type: 'string', enum: ['patch', 'minor', 'major'] },
      source: { type: 'string', description: 'store:, github:o/r[@v], npm:, .tgz (pull).' },
      public: { type: 'boolean' },
      to: { type: 'string', description: 'owner[/repo] (share).' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args, exec) {
      switch (args.action) {
        case 'saved': return JSON.stringify(hub.saved().map(entry => ({ name: entry.name, version: entry.version, integrity: entry.integrity, from: entry.from })))
        case 'save': return JSON.stringify(hub.save(folderOf(exec, args.plugin)))
        case 'version':
          if (!['patch', 'minor', 'major'].includes(args.bump)) throw new Error('version needs bump: patch, minor or major')
          return JSON.stringify(hub.bump(folderOf(exec, args.plugin), args.bump))
        case 'pull': {
          const source = String(args.source ?? '')
          if (!source.startsWith('store:')) {
            const outcome = await ask(exec, `Install the plugin ${source}: its code runs with your permissions.`)
            if (outcome !== 'allowed-once') throw new Error(refusedBy(outcome))
          }
          return JSON.stringify(await hub.pull(source))
        }
        case 'update': {
          const outcome = await ask(exec, `Update the plugin ${args.plugin} to its newest release: the new code runs with your permissions.`)
          if (outcome !== 'allowed-once') throw new Error(refusedBy(outcome))
          return JSON.stringify(await hub.update(String(args.plugin ?? '')))
        }
        case 'share': {
          const folder = folderOf(exec, args.plugin)
          const outcome = await ask(exec, `Share the plugin in ${folder} to ${args.to ?? 'its GitHub repository'} (${args.public === true ? 'public: anyone can find and install it' : 'private'}).`)
          if (outcome !== 'allowed-once') throw new Error(refusedBy(outcome))
          const [owner, repo] = String(args.to ?? '').split('/')
          const result = await hub.share(folder, { ...(owner ? { owner } : {}), ...(repo ? { repo } : {}), ...(args.public === true ? { visibility: 'public' } : {}) })
          if (result.status === 'refused') throw new Error(JSON.stringify(result))
          return JSON.stringify(result)
        }
        default: throw new Error(`unknown action ${JSON.stringify(args.action)}`)
      }
    },
  })]
}

export function apply(ctx) {
  const hub = createPluginHub({
    store: new PluginStore(storeRoot(ctx.appInstance)),
    // Public repositories anonymously; a private one through the user's own gh login.
    releases: firstReleasePort(githubReleasesOverHttps(), githubReleasesViaGh()),
    registry: npmRegistryOverHttps(),
    download: httpsDownload(),
    share: { host: githubCli(), git: gitCli() },
    has: service => ctx.get(service) !== undefined,
    installer: () => ctx.get('pluginManager'),
  })
  ctx.provide('pluginHub', hub)

  // Human-typed: a pull installs code that runs with the user's permissions, so the user's own command is the confirmation (D4); the agent
  // gets its own tools, which propose instead.
  ctx.inject(['commands'], scoped => {
    scoped.effect(() => scoped.commands.register({
      name: 'plugin',
      description: 'List, save, share, pull or version plugins (store:, github:owner/repo, npm:, a .tgz)',
      input: { hint: 'list | saved | save <name> | share <name> [public] | pull <source> | update <name> | version patch <name>' },
      async handler(invocation) {
        return runPluginCommand(invocation?.rawInput, hub, { workspaceDir: invocation?.agent?.session?.header?.cwd, home: ctx.appInstance.home })
      },
    }), 'acryl-plugin-hub: /plugin command')
  })

  ctx.inject(['tools'], scoped => {
    for (const tool of pluginTools(hub, { approval: () => ctx.get('approval'), where: exec => ({ workspaceDir: exec?.agent?.session?.header?.cwd, home: ctx.appInstance.home }) })) scoped.tools.register(tool)
  })
}
