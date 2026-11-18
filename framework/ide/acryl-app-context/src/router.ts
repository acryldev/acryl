import { LOOKUP_TOOL_NAME } from './lookup.ts'

/** The router must stay small: it is in every prompt (ACRYL spec 037 NFR-002). */
export const ROUTER_TOKEN_BUDGET = 650
export const ROUTER_SECTION_NAME = 'acryl:plugin-router'
/** The XML-style tag wrapping the router text, in pi.dev's per-section tag style. */
export const ROUTER_TAG = 'acryl_plugin_docs'
/** After the tool sections, before the local-path suffix (harness SECTION_ORDERS: 5000..10000). */
export const ROUTER_SECTION_ORDER = 9500

export const estimateTokens = (text: string): number => Math.ceil(text.length / 4)

/** The parts of `docs/docs.json` the router reads. */
export interface PackManifest {
  readonly navigation: readonly { readonly title: string; readonly items: readonly { readonly id: string; readonly title: string; readonly path: string }[] }[]
  readonly routes: readonly { readonly when: string; readonly docs: readonly string[] }[]
}

/**
 * The docs router for the system prompt, built the way pi.dev builds its `docs` section (packages/coding-agent/src/core/system-prompt.ts): one tagged
 * section that does not contain the docs but routes the model to them. The topic map ("when asked about X (docs)") is generated from the manifest's
 * routes, so it cannot drift from the docs; the protocol is "read the doc and the nearest example completely before implementing". The last line is
 * the app's hard rule: a feature is a plugin of its own, mounted by its row.
 * @param root - where the pack is, as the agent's tools read it (relative to the app folder when the pack is installed in it).
 */
export function buildRouterText(root: string, manifest: PackManifest): string {
  const pathOf = new Map<string, string>()
  for (const group of manifest.navigation) for (const item of group.items) pathOf.set(item.id, item.path)
  const topics = manifest.routes.map(route => `${route.when} (${route.docs.map(id => pathOf.get(id)).filter(path => path !== undefined).join(', ')})`)
  return [
    `<${ROUTER_TAG}>`,
    `This app's builder docs: ${root}. Read them before you build, change, fix or remove anything in the app (a feature, page, widget, route, data, plugin); or call ${LOOKUP_TOOL_NAME}(topic).`,
    '- Paths below are under docs/; indexes: docs/README.md, example-plugins/README.md (verified plugins); start with start-here/this-app.md',
    `- When asked about: ${topics.join('; ')}`,
    "- Read .md files completely and the nearest example, follow links before implementing; never guess a plugin's shape or an import path from memory",
    '- Every feature is a Cordis plugin: plugins/<name>/index.ts plus its row in blend.yaml. Never wire a feature into src/frame.ts, src/app.ts or src/routes.ts. Done means npm test, npm run check and .acryl/bin/acryl look all agree (start-here/verify-before-done.md)',
    `</${ROUTER_TAG}>`,
  ].join('\n')
}
