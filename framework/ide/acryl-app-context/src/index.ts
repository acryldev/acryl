/**
 * The app builder's context pack (ported from ACRYL's Extension Context Pack, `plugins/acryl-plugin-context`, spec 037). It routes the frame's agent
 * to this package's docs and verified examples, the way pi.dev's system prompt routes its agent to its own docs: one prompt section that names the
 * docs index, the topics and the rule, never the docs themselves.
 *
 * Provides: `appContext` ({ root, manifest(), resolveDoc(id) }), the prompt section `acryl:plugin-router`, and the `acryl_plugin_lookup` tool while
 * the `tools` registry is up (the topic's docs and examples, ranked; ACRYL's lookup), and the snapshot tools (capture, verify, apply) while the
 * frame's `appSnapshot` is up too. Requires: `systemPrompt`.
 * `appInstance` is read when present: the paths the agent reads are given relative to the app folder when the pack is installed in it.
 * `ACRYL_PLUGIN_DOCS=off` leaves the section out (an evaluation switch, as in ACRYL: the same task with and without the docs).
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import { LOOKUP_TOOL_NAME, type LookupManifest, lookupAppDocs } from './lookup.ts'
import { type AppSnapshotTools, snapshotTools } from './snapshot-tools.ts'
import { buildRouterText, type PackManifest, ROUTER_SECTION_NAME, ROUTER_SECTION_ORDER } from './router.ts'

export const name = 'acryl-app-context'
export const inject = ['systemPrompt']

/** The package folder: `lib/` or `src/` sits one level below it. */
export function packRoot(moduleUrl: string = import.meta.url): string {
  return dirname(dirname(fileURLToPath(moduleUrl)))
}

/**
 * Where the agent reads the pack: `node_modules/<its package name>` when the app has it installed (a short path inside its working folder, which its
 * file tools read without leaving the app), else the pack's own folder. The name is read from the pack's `package.json`, because a release publishes
 * it under the frame's scope (`frame/packages.json`).
 */
export function readablePackRoot(root: string, appRoot: string | undefined): string {
  if (appRoot === undefined) return root
  let packageName: string
  try {
    packageName = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { name: string }).name
  } catch {
    return root
  }
  const installed = join(appRoot, 'node_modules', ...packageName.split('/'))
  if (!existsSync(installed)) return root
  try {
    if (realpathSync(installed) !== realpathSync(root)) return root
  } catch {
    return root
  }
  return relative(appRoot, installed).split(sep).join('/')
}

interface SystemPrompt {
  section(section: { name: string; order: number; text: string }): () => void
}

export function apply(ctx: Context): void {
  const root = packRoot()
  const manifest = JSON.parse(readFileSync(join(root, 'docs', 'docs.json'), 'utf8')) as PackManifest & LookupManifest
  const appRoot = (ctx.get('appInstance') as { readonly root?: string } | undefined)?.root
  const systemPrompt = (ctx as unknown as { systemPrompt: SystemPrompt }).systemPrompt
  // Static for the process lifetime: part of the cacheable prompt prefix.
  const readable = readablePackRoot(root, appRoot)
  const text = buildRouterText(readable, manifest)
  if (process.env.ACRYL_PLUGIN_DOCS !== 'off')
    ctx.effect(() => systemPrompt.section({ name: ROUTER_SECTION_NAME, order: ROUTER_SECTION_ORDER, text }), 'app-context: prompt router')
  // The lookup answers in the paths the agent reads (the pack inside the app when it is installed there), like the prompt section.
  ctx.inject(['tools'], scoped => {
    ;(scoped as unknown as { tools: { register(tool: ToolDefinition): unknown } }).tools.register(
      defineTool({
        name: LOOKUP_TOOL_NAME,
        description:
          "Find this app's builder docs and verified example plugins for a topic (for example \"widget on the first screen\", \"keep data after a restart\", \"a page of its own\"). Returns the paths to read; it only routes, the docs are the authority.",
        parameters: {
          topic: { type: 'string', required: true, description: 'What you want to build or change, in a few words.' },
        },
        output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
        async execute(args) {
          const result = lookupAppDocs(String(args.topic ?? ''), manifest, readable)
          if (!result.ok) throw new Error(result.error)
          return JSON.stringify(result)
        },
      }),
    )
  })
  // The snapshot verbs, while the frame provides them: the same service as its left panel's Capture.
  ctx.inject(['tools', 'appSnapshot'], scoped => {
    const { tools, appSnapshot } = scoped as unknown as { tools: { register(tool: ToolDefinition): unknown }; appSnapshot: AppSnapshotTools }
    for (const tool of snapshotTools(appSnapshot)) tools.register(tool)
  })
  ctx.provide('appContext', {
    root,
    manifest: () => manifest,
    resolveDoc(id: string): string | undefined {
      for (const group of manifest.navigation) for (const item of group.items) if (item.id === id) return join(root, 'docs', item.path)
      return undefined
    },
  })
}
