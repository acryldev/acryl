/**
 * Extension Context Pack runtime plugin (spec 037). Routes the agent to the
 * pack's docs and verified examples, the way pi.dev's system prompt routes its
 * agent to its own docs, and gives it the one tool it needs to close the loop:
 * install a plugin it wrote and make it live.
 *
 * Provides: `extensionContext`, the prompt section `acryl:extension-router`, bundled
 * authoring skills (when a `skills` service exists) and the tool `acryl_install_plugin`
 * (when a `tools` service exists).
 * Requires: `systemPrompt`. `tools`, `desktopPnpm` and `livePluginActivation` are
 * optional and read at call time, never captured (the documented ordering trap).
 */
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { globalExtensionsDir } from './lib/reconcile.js'
import { listInstalledPlugins } from './lib/provenance.js'
import { captureApp, captureBlend, verifyBlend, writeAppBlend, writeBlend } from './lib/blend-capture.js'
import { applyBlend } from './lib/blend-apply.js'
import { appHomeDir, blendDir, useAppInstance } from './lib/scopes.js'
import { connectRemote, gitCli, githubHosting, saveApp } from '@acryl/app-persistence'
import { appendLedger, ledgerRecorder, readLedger, trackedBlendDir, verifyLedger } from './lib/blend-ledger.js'
import { describePermissions } from './lib/manifest.js'
import { describeInstalledExtensions, installLocalPlugin, syncOnStartup, listLocalPlugins, reloadLocalPlugins, removeLocalPlugin } from './lib/install.js'
import { lookupExtensionDocs } from './lib/lookup.js'
import { verifyPackage } from './lib/verify.js'
import { preparePublish } from './lib/publish.js'
import { resolvePackRoot } from './lib/pack-root.js'
import { createSkillProvider } from './lib/skills.js'
import { buildRouterText, INSTALL_TOOL_NAME, LIST_TOOL_NAME, REMOVE_TOOL_NAME, PUBLISH_TOOL_NAME, VERIFY_TOOL_NAME, LOOKUP_TOOL_NAME, ROUTER_SECTION_NAME, ROUTER_SECTION_ORDER } from './lib/router.js'

export const name = 'acryl-extension-context'
export const inject = ['systemPrompt']

export function apply(ctx) {
  const root = resolvePackRoot()
  const manifest = JSON.parse(readFileSync(join(root, 'docs', 'docs.json'), 'utf8'))

  // Evaluation switch (evals/README.md): ACRYL_EXTENSION_DOCS=off removes the router, the skills and the installed-extensions note, leaving only the tools,
  // so the same task can be run with and without the docs to measure what they add. Never set it in normal use.
  const docsOff = process.env.ACRYL_EXTENSION_DOCS === 'off'

  // Where this app keeps what its builder writes, from the runtime's app instance (optional: a stock harness host has none and keeps the classic folders).
  ctx.effect(() => useAppInstance(ctx.get('appInstance')), 'extension-context: app instance scopes')

  // Static for the process lifetime: part of the cacheable prompt prefix.
  const text = buildRouterText(root, manifest)
  if (!docsOff) ctx.effect(() => ctx.systemPrompt.section({ name: ROUTER_SECTION_NAME, order: ROUTER_SECTION_ORDER, text }))

  ctx.provide('extensionContext', {
    root,
    manifest: () => manifest,
    resolveDoc(id) {
      for (const group of manifest.navigation) for (const item of group.items) if (item.id === id) return join(root, 'docs', item.path)
      return undefined
    },
  })

  // Bundled authoring skills (workflow triggers linking into the docs). Optional: without a
  // `skills` service the router alone still works.
  ctx.inject(['skills'], scoped => {
    if (!docsOff) scoped.skills.registerProvider(() => createSkillProvider(root))
  })

  // The live view of installed extensions (pi.dev rebuilds its prompt after a reload): a per-assembly dynamic context, empty when none.
  ctx.inject(['systemPrompt'], scoped => {
    if (docsOff) return
    ctx.effect(() => scoped.systemPrompt.context({
      name: 'acryl:installed-extensions',
      order: 9500,
      text: () => describeInstalledExtensions(ctx.get('desktopProfiles')?.current?.dir, ctx.get('livePluginActivation')),
    }), 'extension-context: installed extensions context')
  })

  // Startup pass (pi.dev re-discovers extensions on every start): re-sync changed GLOBAL extensions, report everything else. Deferred one tick so it
  // never runs inside the engine's own boot, and it never throws into the host. See syncOnStartup for why project scope is only reported.
  ctx.inject(['desktopProfiles', 'desktopPnpm', 'livePluginActivation'], scoped => {
    scoped.effect(() => {
      let disposed = false
      const timer = setTimeout(async () => {
        if (disposed) return
        try {
          const profileDir = scoped.get('desktopProfiles')?.current?.dir
          if (!profileDir) return
          const dshHome = scoped.get('dshHomePath')
          const services = { pnpm: scoped.get('desktopPnpm'), live: scoped.get('livePluginActivation'), profileDir }
          // An app (`acryl new`) installs its own committed extensions at start: a fresh clone has them in extensions/ but nothing installed yet.
          const app = appHomeDir()
          const summary = await syncOnStartup(services, { globalDir: globalExtensionsDir(typeof dshHome === 'function' ? dshHome() : undefined), installPending: app !== undefined })
          // ...and the marketplace plugins its lock names, when the lock still matches the app's definition (a stale lock is reported, never guessed).
          let lockNote = ''
          if (app !== undefined && verifyBlend(app).ok) {
            const applied = await applyBlend(app, services, {})
            const installed = applied.results.filter(r => r.origin === 'registry' && r.status === 'installed').map(r => r.name)
            const failed = applied.results.filter(r => ['failed', 'conflict'].includes(r.status)).map(r => `${r.name} (${r.detail ?? r.status})`)
            lockNote = [installed.length > 0 ? `installed from the app lock: ${installed.join(', ')}` : '', failed.length > 0 ? `FAILED from the app lock: ${failed.join(', ')}` : ''].filter(Boolean).join('; ')
          } else if (app !== undefined && existsSync(join(app, 'blend.lock.json'))) {
            lockNote = 'the app lock no longer matches blend.yaml (type /blend snapshot to refresh it); marketplace plugins were not installed from it'
          }
          const parts = [
            summary.installed.length > 0 ? `installed the app's extensions ${summary.installed.join(', ')}` : '',
            lockNote,
            summary.updated.length > 0 ? `re-synced ${summary.updated.join(', ')}` : '',
            summary.changed.length > 0 ? `source changed since install (type /reload to apply): ${summary.changed.join(', ')}` : '',
            summary.stale.length > 0 ? `source folder missing (/reload remove-stale): ${summary.stale.join(', ')}` : '',
            summary.pending.length > 0 ? `new global extensions not installed (/reload new): ${summary.pending.join(', ')}` : '',
            ...summary.failed.map(f => `FAILED ${f.name}: ${f.error}`),
          ].filter(Boolean)
          if (parts.length > 0) ctx.logger.info(`[extension-context] startup: ${parts.join('; ')}`)
        } catch (cause) { ctx.logger.warn(`[extension-context] startup sync failed: ${cause instanceof Error ? cause.message : String(cause)}`) }
      }, 0)
      return () => { disposed = true; clearTimeout(timer) }
    }, 'extension-context: startup sync')
  })

  // `/reload`: re-install every local plugin from its source directory, and install new folders under <workspace>/.acryl-extensions/.
  ctx.inject(['commands'], scoped => {
    ctx.effect(function* () {
      yield scoped.commands.register({
        name: 'reload',
        description: 'Reload local extensions from their source folders',
        // Without `input` the client treats the command as argument-less and sends `/reload new` to the model as chat.
        input: { hint: '[new|remove-stale]' },
        async handler(invocation) {
          const profileDir = ctx.get('desktopProfiles')?.current?.dir
          if (!profileDir) return { kind: 'error', text: 'The active profile is not available in this runtime.' }
          // The session's workspace, so extension folders dropped under <workspace>/.acryl-extensions/ are discovered too.
          const workspaceDir = invocation?.agent?.session?.header?.cwd
          // `/reload new` also installs extension folders found under .acryl-extensions/ that are not installed yet: they run with the
          // user's permissions, so the human opts in explicitly.
          const words = String(invocation?.rawInput ?? '').trim().split(/\s+/u).filter(Boolean)
          const installDiscovered = words.includes('new')
          // `/reload remove-stale` removes installs whose source folder is gone; without it they are only reported.
          const removeStale = words.includes('remove-stale')
          const dshHome = ctx.get('dshHomePath')
          const globalDir = globalExtensionsDir(typeof dshHome === 'function' ? dshHome() : undefined)
          const results = await reloadLocalPlugins({ pnpm: ctx.get('desktopPnpm'), live: ctx.get('livePluginActivation'), profileDir, record: ledgerRecorder(workspaceDir, 'human') }, undefined, { workspaceDir, globalDir, installDiscovered, removeStale })
          if (results.length === 0) return { kind: 'success', text: 'No local extensions installed or found in <workspace>/.acryl-extensions/ or the global extensions directory.' }
          const tag = r => (r.scope ? ` [${r.scope}]` : '')
          const lines = results.map(r =>
            r.stale && r.removed ? `${r.name}: STALE, source folder missing - removed`
            : r.stale && r.ok ? `${r.name}: STALE - source folder ${r.dir} no longer exists, so it cannot be updated. Type /reload remove-stale to remove it`
            : r.shadowed ? `${r.dir}: SHADOWED by the project extension "${r.name}" - not loaded`
            : r.pending ? `${r.dir}${tag(r)}: NEW, not installed - ${describePermissions(r.permissions)}. It would run with your permissions: review it, then type /reload new`
            : r.ok ? `${r.name}${tag(r)}: ${r.action}${r.discovered ? ' (new)' : ''}`
            : `${r.name}: FAILED - ${(r.errors ?? []).join('; ')}`)
          const failed = results.some(r => !r.ok)
          // The reload hint only matters when something was (re)installed or removed.
          const touched = results.some(r => r.action !== undefined && r.action !== 'unchanged' || r.removed)
          const text = touched ? `${lines.join('\n')}\nReload the page (Web) or window (Desktop, Cmd/Ctrl+R) to pick up UI changes.` : lines.join('\n')
          return failed ? { kind: 'error', text } : { kind: 'success', text }
        },
      })
    }, 'extension-context reload command')
  })

  // `/blend snapshot` writes the running composition (marketplace plugins AND local extensions) to <workspace>/.acryl/blend/ as a Blend; `/blend verify`
  // checks it against its own lock. Human-typed, no model tool: capturing state is the user's decision and costs no prompt tokens.
  ctx.inject(['commands'], scoped => {
    ctx.effect(function* () {
      yield scoped.commands.register({
        name: 'blend',
        description: 'Capture the installed plugins and local extensions as a Blend, verify it, or apply a captured one',
        input: { hint: '[snapshot|verify|apply|ledger]' },
        async handler(invocation) {
          const profileDir = ctx.get('desktopProfiles')?.current?.dir
          const workspaceDir = invocation?.agent?.session?.header?.cwd
          if (!profileDir) return { kind: 'error', text: 'The active profile is not available in this runtime.' }
          if (!workspaceDir && appHomeDir() === undefined) return { kind: 'error', text: 'This session has no workspace directory to keep the Blend in.' }
          const outDir = blendDir(workspaceDir)
          const verb = String(invocation?.rawInput ?? '').trim().split(/\s+/u)[0]
          if (verb === 'verify') {
            const result = verifyBlend(outDir)
            const ledger = verifyLedger(outDir)
            const problems = [...result.problems, ...ledger.problems]
            return problems.length === 0 ? { kind: 'success', text: `Blend in ${outDir} matches its lock (${result.checked} checks); ledger: ${ledger.entries} entries, chain intact.` } : { kind: 'error', text: `Blend in ${outDir}:\n${problems.map(p => `- ${p}`).join('\n')}` }
          }
          if (verb === 'ledger') {
            if (trackedBlendDir(workspaceDir) === undefined) return { kind: 'error', text: 'This workspace tracks no Blend yet: type /blend snapshot first. The ledger records changes from then on.' }
            const entries = readLedger(outDir).slice(-20)
            return { kind: 'success', text: entries.length === 0 ? 'The ledger is empty.' : entries.map(e => `${e.at} ${e.actor ?? '?'} ${e.kind}${e.module ? ` ${e.module}` : ''}${e.version ? `@${e.version}` : ''}`).join('\n') }
          }
          if (verb === 'apply') {
            // Installs code that runs with the user's permissions: human-typed only, the summary shows what each module requests.
            const result = await applyBlend(outDir, { pnpm: ctx.get('desktopPnpm'), live: ctx.get('livePluginActivation'), profileDir, record: ledgerRecorder(workspaceDir, 'human') }, { workspaceDir })
            if (result.problems.length === 0) appendLedger(outDir, { actor: 'human', kind: 'applied', results: result.results.map(r => ({ module: r.name, origin: r.origin, status: r.status })) })
            if (result.problems.length > 0) return { kind: 'error', text: `Nothing was installed; the Blend in ${outDir} does not match its lock:\n${result.problems.map(p => `- ${p}`).join('\n')}` }
            const lines = result.results.map(r => `${r.name} [${r.origin}]: ${r.status}${r.permissions ? ` (${r.permissions})` : ''}${r.detail ? ` - ${r.detail}` : ''}`)
            const touched = result.results.some(r => ['installed', 'updated'].includes(r.status))
            return { kind: result.ok ? 'success' : 'error', text: `${lines.join('\n')}${touched ? '\nReload the page (Web) or window (Desktop, Cmd/Ctrl+R) to pick up UI changes.' : ''}` }
          }
          if (verb !== 'snapshot') return { kind: 'error', text: 'Usage: /blend snapshot (capture the current state), /blend verify, /blend apply (re-create a captured Blend here), or /blend ledger (what changed).' }
          const dshHome = ctx.get('dshHomePath')
          const app = appHomeDir()
          if (app !== undefined) {
            // An app IS its Blend: record into the app folder, keeping the user's blend.yaml and adding only rows it does not name yet.
            const capture = captureApp({ profileDir, appHome: app, globalDir: globalExtensionsDir(typeof dshHome === 'function' ? dshHome() : undefined) })
            const files = writeAppBlend(capture, app)
            appendLedger(app, { actor: 'human', kind: 'captured', blend: `${capture.manifest.metadata?.id}@${capture.manifest.metadata?.version}`, modules: capture.lock.modules.length, digest: capture.lock.origin.digest })
            const added = capture.addedRows.length > 0 ? ` Added to blend.yaml: ${capture.addedRows.join(', ')}.` : ''
            const notes = capture.notes.length > 0 ? `\nNot captured:\n${capture.notes.map(n => `- ${n}`).join('\n')}` : ''
            return { kind: 'success', text: `Recorded the app in ${app}: ${capture.lock.modules.length} module(s) locked.${added} Written: ${files.join(', ')}. Commit the app folder to keep this state.${notes}` }
          }
          const capture = captureBlend({ profileDir, workspaceDir, globalDir: globalExtensionsDir(typeof dshHome === 'function' ? dshHome() : undefined) })
          const files = writeBlend(capture, outDir)
          appendLedger(outDir, { actor: 'human', kind: 'captured', blend: `${capture.manifest.metadata.id}@${capture.manifest.metadata.version}`, modules: capture.lock.modules.length, digest: capture.lock.origin.digest })
          const local = capture.lock.modules.filter(m => m.origin === 'local').length
          const registry = capture.lock.modules.filter(m => m.origin === 'registry').length
          const notes = capture.notes.length > 0 ? `\nNot captured:\n${capture.notes.map(n => `- ${n}`).join('\n')}` : ''
          return { kind: 'success', text: `Captured ${capture.manifest.kind} ${capture.manifest.metadata.id}@${capture.manifest.metadata.version}: ${registry} marketplace plugin(s), ${local} local extension(s) vendored.\nWritten to ${outDir}: ${files.join(', ')}${notes}` }
        },
      })
    }, 'extension-context blend command')
  })

  // `/app save` and `/app connect` (spec 036, persistence-and-registries.md): keep an app in its own git repository from inside the app, for users who never
  // open a terminal. Human-typed only, like `/blend apply`: saving publishes the user's work to a remote, so it is the user's decision; the agent may suggest
  // it, never run it. The rules (secret check, a private app never reaches a public remote) are @acryl/app-persistence's.
  ctx.inject(['commands'], scoped => {
    ctx.effect(function* () {
      yield scoped.commands.register({
        name: 'app',
        description: 'Save this app to its own git repository, or connect it to one (private unless the app says public)',
        input: { hint: 'save [message] | connect [public|private] [repository name]' },
        async handler(invocation) {
          const app = appHomeDir()
          if (app === undefined) return { kind: 'error', text: 'This is not an app created with acryl new, so it has no repository of its own to save to.' }
          const [verb = '', ...rest] = String(invocation?.rawInput ?? '').trim().split(/\s+/u).filter(Boolean)
          const manifestText = readFileSync(join(app, 'blend.yaml'), 'utf8')
          try {
            if (verb === 'save') {
              const result = saveApp({ manifestText, message: rest.join(' ') || `Save ${new Date().toISOString().slice(0, 16).replace('T', ' ')}` }, gitCli(app), githubHosting(app))
              if (result.status === 'saved') return { kind: 'success', text: `Saved ${result.commit.slice(0, 8)}${result.pushed ? ` and pushed to ${result.remote}` : '. It has no remote yet: type /app connect to create a private GitHub repository for it.'}` }
              if (result.status === 'nothing-to-save') return { kind: 'success', text: 'Nothing to save: no changes since the last save.' }
              return { kind: 'error', text: `Not saved: ${result.reason}${(result.secrets ?? []).map(found => `\n- ${found.path}${found.line > 0 ? `:${found.line}` : ''} (${found.kind})`).join('')}` }
            }
            if (verb === 'connect') {
              const visibility = rest[0] === 'public' || rest[0] === 'private' ? rest.shift() : undefined
              const result = connectRemote({ manifestText, name: rest[0] ?? app.split(/[\\/]/u).at(-1), ...(visibility === undefined ? {} : { visibility }) }, gitCli(app), githubHosting(app))
              return result.status === 'connected'
                ? { kind: 'success', text: `${result.created ? 'Created' : 'Connected'} the ${result.visibility} repository ${result.remote}. Type /app save to push the app to it.` }
                : { kind: 'error', text: `Not connected: ${result.reason}` }
            }
          } catch (cause) {
            return { kind: 'error', text: String(cause?.message ?? cause) }
          }
          return { kind: 'error', text: 'Usage: /app save [message], or /app connect [public|private] [repository name].' }
        },
      })
    }, 'extension-context app command')
  })

  ctx.inject(['tools'], scoped => {
    scoped.tools.register(defineTool({
      name: INSTALL_TOOL_NAME,
      description: 'Install a plugin package you wrote into the active ACRYL profile and activate it live (no restart), or UPDATE it if it is already installed. Checks the package first and undoes the install if activation fails. Pass the ABSOLUTE path of the package directory. Returns the plugin status or the exact error to fix.',
      parameters: {
        path: { type: 'string', required: true, description: 'ABSOLUTE path of the plugin package directory (the folder containing package.json).' },
      },
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      async execute(args, exec) {
        const result = await installLocalPlugin({ path: args.path }, { pnpm: ctx.get('desktopPnpm'), live: ctx.get('livePluginActivation'), profileDir: ctx.get('desktopProfiles')?.current?.dir, record: ledgerRecorder(exec?.agent?.session?.header?.cwd, 'agent') })
        // A thrown error is reported to the model as a tool error with the full detail.
        if (!result.ok) throw new Error(JSON.stringify(result, null, 2))
        return JSON.stringify(result)
      },
    }))

    scoped.tools.register(defineTool({
      name: LIST_TOOL_NAME,
      description: 'List every plugin installed in the active ACRYL profile with its origin: "local" (built here; has a source folder you can edit, and a scope) or "registry" (installed from the marketplace/npm; managed, do not edit, has version and integrity digest).',
      parameters: {},
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      async execute() {
        const profile = ctx.get('desktopProfiles')
        if (!profile?.current?.dir) throw new Error('the active profile is not available in this runtime')
        const dshHome = ctx.get('dshHomePath')
        const globalDir = globalExtensionsDir(typeof dshHome === 'function' ? dshHome() : undefined)
        // `installedFrom` is kept for local plugins: it is the name the skills and docs already use for the editable source directory.
        return JSON.stringify(listInstalledPlugins(profile.current.dir, { globalDir }).map(plugin => (plugin.origin === 'local' ? { ...plugin, installedFrom: plugin.source } : plugin)))
      },
    }))

    scoped.tools.register(defineTool({
      name: LOOKUP_TOOL_NAME,
      description: 'Find the ACRYL extension docs and verified examples for a topic (for example "sidebar tab", "accent color", "a tool", "hook the prompt"). Returns absolute paths to read; it only routes, the docs are the authority.',
      parameters: {
        topic: { type: 'string', required: true, description: 'What you want to build or change, in a few words.' },
      },
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      async execute(args) {
        const result = lookupExtensionDocs(String(args.topic ?? ''), manifest, root)
        if (!result.ok) throw new Error(result.error)
        return JSON.stringify(result)
      },
    }))

    scoped.tools.register(defineTool({
      name: VERIFY_TOOL_NAME,
      description: 'Check a plugin package you wrote WITHOUT installing it: install lint plus importing the host entry and checking its Cordis shape. Findings include the exact error and the pack doc ids that explain the fix. Pass the ABSOLUTE package directory.',
      parameters: {
        path: { type: 'string', required: true, description: 'ABSOLUTE path of the plugin package directory.' },
      },
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      async execute(args) {
        if (typeof args.path !== 'string' || !isAbsolute(args.path)) throw new Error('path must be the ABSOLUTE package directory')
        return JSON.stringify(await verifyPackage({ path: args.path }))
      },
    }))

    scoped.tools.register(defineTool({
      name: PUBLISH_TOOL_NAME,
      description: 'Check that a local plugin package is ready for the marketplace (install checks, catalog metadata, npm pack dry run). It NEVER publishes: publishing is done by the user. Pass the ABSOLUTE package directory.',
      parameters: {
        path: { type: 'string', required: true, description: 'ABSOLUTE path of the plugin package directory.' },
      },
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      async execute(args) {
        const result = await preparePublish({ path: args.path })
        if (!result.ok) throw new Error(JSON.stringify(result, null, 2))
        return JSON.stringify(result)
      },
    }))

    scoped.tools.register(defineTool({
      name: REMOVE_TOOL_NAME,
      description: 'Remove a local plugin from the active ACRYL profile and unmount it live. Pass the package name (see the list tool).',
      parameters: {
        package: { type: 'string', required: true, description: 'Package name of the plugin to remove.' },
      },
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      async execute(args, exec) {
        const result = await removeLocalPlugin({ package: args.package }, { pnpm: ctx.get('desktopPnpm'), live: ctx.get('livePluginActivation'), record: ledgerRecorder(exec?.agent?.session?.header?.cwd, 'agent') })
        if (!result.ok) throw new Error(JSON.stringify(result, null, 2))
        return JSON.stringify(result)
      },
    }))
  })
}
