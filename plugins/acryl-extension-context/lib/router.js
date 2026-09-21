import { join } from 'node:path'

/** The router must stay small: it is in every prompt (spec 037 NFR-002). */
export const ROUTER_TOKEN_BUDGET = 1500
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
  const docs = join(root, 'docs')
  const examples = join(root, 'examples')
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
    'ACRYL extension documentation (read only when the user asks to build, change, fix, improve, extend or remove something in ACRYL itself: an extension, plugin, tool, panel, button, view, theme, skill, command or LLM adapter):',
    `- Docs index: ${join(docs, 'README.md')}; or call ${LOOKUP_TOOL_NAME}(topic) for the docs and examples that match a topic`,
    `- Examples: ${join(examples, 'README.md')} (working, verified plugins for every plugin type and surface)`,
    `- When reading ACRYL docs, resolve the relative paths below under ${docs}/, not the current working directory`,
    `- Start with ${join(docs, 'start-here', 'this-runtime.md')}. Where something mounts on the CLI, Web or Desktop, and every plugin type: maps/mount-points.md, maps/slot-contracts.md (props and examples per slot), maps/events.md, maps/taxonomy.md`,
    `- When asked about: ${topics.join(', ')}`,
    '- Reference for the Cordis API and every harness subsystem: reference/ (one file each, listed in the docs index)',
    '- When working on ACRYL extension topics, read the docs and the nearest example, and follow .md cross-references before implementing',
    '- Always read ACRYL .md files completely and follow links to related docs',
    `- Write extensions in <workspace>/.acryl-extensions/<name>/ and deliver with ${INSTALL_TOOL_NAME} (ABSOLUTE path; calling it again updates). Check first with ${VERIFY_TOOL_NAME}; also ${LIST_TOOL_NAME}, ${REMOVE_TOOL_NAME}, ${PUBLISH_TOOL_NAME} (a dry run: publishing is the user's decision). Never claim a plugin works without the tool result; UI needs a page reload (the user can type /reload, which also installs new folders under .acryl-extensions/)`,
    `</${ROUTER_TAG}>`,
  ].join('\n')
}
