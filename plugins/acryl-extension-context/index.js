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
import { readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { describeInstalledExtensions, installLocalPlugin, listLocalPlugins, reloadLocalPlugins, removeLocalPlugin } from './lib/install.js'
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

  // `/reload`: re-install every local plugin from its source directory, and install new folders under <workspace>/.acryl-extensions/.
  ctx.inject(['commands'], scoped => {
    ctx.effect(function* () {
      yield scoped.commands.register({
        name: 'reload',
        description: 'Reload local extensions from their source folders',
        // Without `input` the client treats the command as argument-less and sends `/reload new` to the model as chat.
        input: { hint: '[new]' },
        async handler(invocation) {
          const profileDir = ctx.get('desktopProfiles')?.current?.dir
          if (!profileDir) return { kind: 'error', text: 'The active profile is not available in this runtime.' }
          // The session's workspace, so extension folders dropped under <workspace>/.acryl-extensions/ are discovered too.
          const workspaceDir = invocation?.agent?.session?.header?.cwd
          // `/reload new` also installs extension folders found under .acryl-extensions/ that are not installed yet: they run with the
          // user's permissions, so the human opts in explicitly.
          const installDiscovered = String(invocation?.rawInput ?? '').trim() === 'new'
          const results = await reloadLocalPlugins({ pnpm: ctx.get('desktopPnpm'), live: ctx.get('livePluginActivation'), profileDir }, undefined, { workspaceDir, installDiscovered })
          if (results.length === 0) return { kind: 'success', text: 'No local extensions installed or found in .acryl-extensions/.' }
          const lines = results.map(r => r.pending ? `${r.dir}: NEW, not installed. It would run with your permissions: review it, then type /reload new` : r.ok ? `${r.name}: ${r.action}${r.discovered ? ' (new)' : ''}` : `${r.name}: FAILED - ${(r.errors ?? []).join('; ')}`)
          const failed = results.some(r => !r.ok)
          const text = `${lines.join('\n')}\nReload the page (Web) or window (Desktop, Cmd/Ctrl+R) to pick up UI changes.`
          return failed ? { kind: 'error', text } : { kind: 'success', text }
        },
      })
    }, 'extension-context reload command')
  })

  ctx.inject(['tools'], scoped => {
    scoped.tools.register(defineTool({
      name: INSTALL_TOOL_NAME,
      description: 'Install a plugin package you wrote into the active ACRYL profile and activate it live (no restart), or UPDATE it if it is already installed. Checks the package first and undoes the install if activation fails. Pass the ABSOLUTE path of the package directory. Returns the plugin status or the exact error to fix.',
      parameters: {
        path: { type: 'string', required: true, description: 'ABSOLUTE path of the plugin package directory (the folder containing package.json).' },
      },
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      async execute(args) {
        const result = await installLocalPlugin({ path: args.path }, { pnpm: ctx.get('desktopPnpm'), live: ctx.get('livePluginActivation'), profileDir: ctx.get('desktopProfiles')?.current?.dir })
        // A thrown error is reported to the model as a tool error with the full detail.
        if (!result.ok) throw new Error(JSON.stringify(result, null, 2))
        return JSON.stringify(result)
      },
    }))

    scoped.tools.register(defineTool({
      name: LIST_TOOL_NAME,
      description: 'List the local plugins installed in the active ACRYL profile and the directory each was installed from, so you can find and edit them.',
      parameters: {},
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      async execute() {
        const profile = ctx.get('desktopProfiles')
        if (!profile?.current?.dir) throw new Error('the active profile is not available in this runtime')
        return JSON.stringify(listLocalPlugins(profile.current.dir))
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
      async execute(args) {
        const result = await removeLocalPlugin({ package: args.package }, { pnpm: ctx.get('desktopPnpm'), live: ctx.get('livePluginActivation') })
        if (!result.ok) throw new Error(JSON.stringify(result, null, 2))
        return JSON.stringify(result)
      },
    }))
  })
}
