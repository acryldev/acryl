import { join } from 'node:path'

/** The router must stay small: it is in every prompt (spec 037 NFR-002). */
export const ROUTER_TOKEN_BUDGET = 650
export const ROUTER_SECTION_NAME = 'acryl:extension-router'
/** The XML-style tag wrapping the router text, in pi.dev's per-section tag style. */
export const ROUTER_TAG = 'acryl_extension_docs'
/** After the tool sections, before the local-path suffix (harness SECTION_ORDERS: 5000..10000). */
export const ROUTER_SECTION_ORDER = 9500
export const INSTALL_TOOL_NAME = 'acryl_install_plugin'
export const LIST_TOOL_NAME = 'acryl_list_plugins'
export const REMOVE_TOOL_NAME = 'acryl_remove_plugin'
export const VERIFY_TOOL_NAME = 'acryl_verify_plugin'
export const LOOKUP_TOOL_NAME = 'acryl_extension_lookup'
export const PUBLISH_TOOL_NAME = 'acryl_prepare_publish'

export const estimateTokens = text => Math.ceil(text.length / 4)

/**
 * The docs router for the system prompt, built the way pi.dev builds its `docs` section (packages/coding-agent/src/core/system-prompt.ts):
 * one tagged section that does not contain the architecture but routes the model to it. Paths are resolved at runtime from the installed
 * package; the topic map is inline ("when asked about X (doc)"); the protocol is "read the docs and the nearest example, read .md files
 * completely, follow cross-references before implementing". The topic map is generated from the manifest (`topic` labels), so it cannot
 * drift from the docs. The tag lets the model tell this block from its neighbours, as pi's per-section tags do.
 * @param {string} root pack root on disk
 * @param {{ navigation: Array<{ items: Array<{ id?: string, topic?: string, title: string, path: string, applies: string }> }> }} manifest
 */
export function buildRouterText(root, manifest) {
  const pathOf = new Map()
  for (const group of manifest.navigation) for (const item of group.items) if (item.id) pathOf.set(item.id, item.path)
  const topics = []
  if (Array.isArray(manifest.routes)) {
    // Curated routes (pi.dev lists about a dozen "when asked about X (docs)" entries): several docs per route, most important first.
    for (const route of manifest.routes) topics.push(`${route.when} (${route.docs.map(id => pathOf.get(id)).filter(Boolean).join(', ')})`)
  } else {
    for (const group of manifest.navigation) {
      for (const item of group.items) {
        if (item.applies === 'not-for-authors' || item.id?.startsWith('reference.') || item.id?.startsWith('maps.')) continue
        topics.push(`${item.topic ?? (item.title.length > 48 ? `${item.title.slice(0, 45)}...` : item.title)} (${item.path})`)
      }
    }
  }
  return [
    `<${ROUTER_TAG}>`,
    `ACRYL extension docs: ${root}. Read only when the user asks to build, change, fix or remove something in ACRYL itself (extension, plugin, tool, panel, button, theme, skill, command, provider); or call ${LOOKUP_TOOL_NAME}(topic).`,
    '- Paths below are under docs/; indexes: docs/README.md, example-plugins/README.md (verified plugins); start with start-here/this-runtime.md',
    `- When asked about: ${topics.join(', ')}`,
    "- Read .md files completely and the nearest example, follow links before implementing; never guess a plugin's shape from memory",
    `- Write in <workspace>/.acryl-extensions/<name>/ (this project) or <ACRYL home>/extensions/<name>/ (all projects); check with ${VERIFY_TOOL_NAME}; deliver with ${INSTALL_TOOL_NAME} (ABSOLUTE path; again = update). Removing and publish prep have their own tools; publishing is the user's decision. Do not claim it works without the tool result; UI needs a page reload (/reload)`,
    `</${ROUTER_TAG}>`,
  ].join('\n')
}
