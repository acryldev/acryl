import { join } from 'node:path'

/** The router must stay small: it is in every prompt (spec 037 NFR-002). */
export const ROUTER_TOKEN_BUDGET = 1500
export const ROUTER_SECTION_NAME = 'acryl:extension-router'
/** After the tool sections, before the local-path suffix (harness SECTION_ORDERS: 5000..10000). */
export const ROUTER_SECTION_ORDER = 9500
export const INSTALL_TOOL_NAME = 'acryl_install_plugin'

export const estimateTokens = text => Math.ceil(text.length / 4)

/**
 * The docs router for the system prompt, the same idea as pi.dev's `docs`
 * section: a small index of where the reference material lives, generated from
 * the manifest with paths resolved at runtime, plus the policy "read the doc and
 * the nearest example fully before implementing; verify; deliver".
 * @param {string} root pack root on disk
 * @param {{ navigation: Array<{ items: Array<{ title: string, path: string, applies: string }> }> }} manifest
 */
export function buildRouterText(root, manifest) {
  const docs = join(root, 'docs')
  const examples = join(root, 'examples')
  const lines = [
    'ACRYL extension docs. Read them ONLY when the user asks you to build, change or extend ACRYL itself:',
    'a plugin, tool, UI slot, skill, prompt contribution or LLM adapter. Otherwise ignore this section.',
    `- Docs index: ${join(docs, 'README.md')}  (manifest: ${join(docs, 'docs.json')})`,
    `- Examples (working, verified plugins): ${join(examples, 'README.md')}`,
    `- Read ${join(docs, 'start-here', 'this-runtime.md')} first.`,
    '- Before writing code: read the doc for your topic and the nearest example COMPLETELY, and follow their',
    '  cross-references. Never guess a plugin\'s shape from memory of a similar one.',
    '- Topic -> doc:',
  ]
  for (const group of manifest.navigation) {
    for (const item of group.items) {
      if (item.applies === 'not-for-authors') continue
      lines.push(`  - ${item.title}: ${join(docs, item.path)}`)
    }
  }
  lines.push(
    `- To make a plugin live, call the ${INSTALL_TOOL_NAME} tool with the package directory. It checks the package,`,
    '  installs it into the active profile and activates it live, and undoes the install if activation fails.',
    '  Read its result; never claim a plugin works, or state its state, without it.',
    '- Publishing to the marketplace is a human decision: prepare the package and tell the user; you cannot publish.',
  )
  return lines.join('\n')
}
