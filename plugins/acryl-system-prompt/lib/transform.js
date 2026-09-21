import { createHash } from 'node:crypto'

/** pi.dev opens its prompt with one identity line ("You are an expert coding assistant operating inside pi, ..."). This is ACRYL's. */
export const DEFAULT_IDENTITY = 'You are an expert coding assistant operating inside ACRYL, a coding agent harness that can extend itself with plugins. You help users by reading files, executing commands, editing code, and writing new files, and by building, changing and removing ACRYL extensions when asked.'

/** Section names the harness registers for its identity line. */
export const IDENTITY_SECTION = 'harness:identity'

/** Readable tag names for sections whose harness name is not tag-friendly (pi.dev uses tags such as `docs`, `cwd`, `skills`). */
const TAG_ALIASES = {
  'deployment:persona-prefix': 'persona',
  'deployment:persona-suffix': 'cwd',
  'acryl:extension-router': 'acryl_extension_docs',
}

/** `tool:read` becomes `tool_read`; anything outside `[a-z0-9_-]` becomes `_`, and a tag never starts with a digit or separator. */
export function tagName(sectionName) {
  if (TAG_ALIASES[sectionName]) return TAG_ALIASES[sectionName]
  const tag = sectionName.toLowerCase().replace(/[^a-z0-9_-]+/gu, '_').replace(/^[^a-z]+/u, '').replace(/_+$/u, '')
  return tag === '' ? 'section' : tag
}

/** A section whose text already is one complete tagged block (the extension router carries its own tag). */
const alreadyTagged = text => /^<([a-z][a-z0-9_-]*)>[\s\S]*<\/\1>\s*$/u.test(text.trim())

/**
 * Shape the harness's assembled sections the way pi.dev's `buildSystemPromptSections` shapes its own: an untagged opening identity line,
 * then every other section as a tagged block, with empty sections dropped. Nothing else is rewritten: every section that is not the
 * identity passes through with its upstream text unchanged, so upstream improvements to tool guidance still reach the model.
 * @param {Array<{ name: string, text: string }>} sections upstream sections in final order
 * @param {{ identity?: string, tagSections?: boolean, dropEmpty?: boolean }} [options]
 */
export function shapeSections(sections, options = {}) {
  const identity = options.identity ?? DEFAULT_IDENTITY
  const tagSections = options.tagSections ?? true
  const dropEmpty = options.dropEmpty ?? true
  const out = []
  for (const section of sections) {
    if (section.name === IDENTITY_SECTION) { out.push({ name: section.name, text: identity }); continue }
    const text = String(section.text ?? '')
    if (dropEmpty && text.trim() === '') continue
    if (!tagSections || alreadyTagged(text)) { out.push({ name: section.name, text }); continue }
    const tag = tagName(section.name)
    out.push({ name: section.name, text: `<${tag}>\n${text.trim()}\n</${tag}>` })
  }
  return out
}

/**
 * What upstream contributed, for drift detection: name and a short hash of the text, excluding ACRYL's own sections (they carry
 * machine-specific paths and are ours to change). Variables such as `{{cwd}}` are not yet interpolated at this stage, so the hashes are stable.
 */
/** Text that legitimately differs per run (the web surface section names its random local port) must not look like drift. */
export function normalizeVolatile(text) {
  return String(text ?? '').replace(/\b(127\.0\.0\.1|localhost|0\.0\.0\.0):\d+/gu, '$1:<port>')
}

export function upstreamSnapshot(sections) {
  return sections
    .filter(section => !section.name.startsWith('acryl:'))
    .map(section => ({ name: section.name, hash: createHash('sha256').update(normalizeVolatile(section.text)).digest('hex').slice(0, 12) }))
}
