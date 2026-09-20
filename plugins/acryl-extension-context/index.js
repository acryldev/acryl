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
import { join } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { installLocalPlugin } from './lib/install.js'
import { resolvePackRoot } from './lib/pack-root.js'
import { createSkillProvider } from './lib/skills.js'
import { buildRouterText, INSTALL_TOOL_NAME, ROUTER_SECTION_NAME, ROUTER_SECTION_ORDER } from './lib/router.js'

export const name = 'acryl-extension-context'
export const inject = ['systemPrompt']

export function apply(ctx) {
  const root = resolvePackRoot()
  const manifest = JSON.parse(readFileSync(join(root, 'docs', 'docs.json'), 'utf8'))

  // Static for the process lifetime: part of the cacheable prompt prefix.
  const text = buildRouterText(root, manifest)
  ctx.effect(() => ctx.systemPrompt.section({ name: ROUTER_SECTION_NAME, order: ROUTER_SECTION_ORDER, text }))

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
    scoped.skills.registerProvider(() => createSkillProvider(root))
  })

  ctx.inject(['tools'], scoped => {
    scoped.tools.register(defineTool({
      name: INSTALL_TOOL_NAME,
      description: 'Install a plugin package you wrote into the active ACRYL profile and activate it live (no restart). Checks the package first and undoes the install if activation fails. Pass the package directory. Returns the plugin status or the exact error to fix.',
      parameters: {
        path: { type: 'string', required: true, description: 'Directory of the plugin package (the folder containing package.json).' },
      },
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      async execute(args) {
        const result = await installLocalPlugin({ path: args.path }, { pnpm: ctx.get('desktopPnpm'), live: ctx.get('livePluginActivation') })
        // A thrown error is reported to the model as a tool error with the full detail.
        if (!result.ok) throw new Error(JSON.stringify(result, null, 2))
        return JSON.stringify(result)
      },
    }))
  })
}
