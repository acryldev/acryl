import { createHash } from 'node:crypto'

/** pi.dev opens its prompt with one identity line ("You are an expert coding assistant operating inside pi, ..."). This is the Blends app builder's. */
export const DEFAULT_IDENTITY =
  'You are an expert coding assistant operating inside an ACRYL Blends app, an app made of Cordis plugins that blend.yaml composes and that you extend by writing plugins. You help users by reading files, executing commands, editing code, and writing new files, and by building, changing and removing the app\'s plugins when asked.'

/**
 * How the agent writes its replies to the person: plain words, short, and with a plain dash instead of an em dash (the owner's rule for everything
 * ACRYL writes, which a model otherwise breaks in nearly every answer).
 */
export const DEFAULT_STYLE =
  'Write replies in plain, short sentences the person can act on. Never use the em dash character (U+2014) or the en dash (U+2013) in replies, code comments or files you write; use a plain hyphen-minus (-) or a comma instead.'

/** The reply style's section: right after the identity line (the harness identity is -1000, the deployment persona 0). */
export const STYLE_SECTION = { name: 'acryl:reply-style', order: -900 } as const

/** Section names the harness registers for its identity line. */
export const IDENTITY_SECTION = 'harness:identity'

/** Readable tag names for sections whose harness name is not tag-friendly (pi.dev uses tags such as `docs`, `cwd`, `skills`). */
const TAG_ALIASES: Readonly<Record<string, string>> = {
  'deployment:persona-prefix': 'persona',
  'deployment:persona-suffix': 'cwd',
  'acryl:plugin-router': 'acryl_plugin_docs',
  'acryl:reply-style': 'reply_style',
}

/** One section of the assembled prompt, as the harness's `system-prompt/assemble` waterfall carries it. */
export interface PromptSection {
  readonly name: string
  readonly text: string
}

export interface ShapeOptions {
  readonly identity?: string
  readonly tagSections?: boolean
  readonly dropEmpty?: boolean
}

/** `tool:read` becomes `tool_read`; anything outside `[a-z0-9_-]` becomes `_`, and a tag never starts with a digit or separator. */
export function tagName(sectionName: string): string {
  const alias = TAG_ALIASES[sectionName]
  if (alias !== undefined) return alias
  const tag = sectionName.toLowerCase().replace(/[^a-z0-9_-]+/gu, '_').replace(/^[^a-z]+/u, '').replace(/_+$/u, '')
  return tag === '' ? 'section' : tag
}

/** A section whose text already is one complete tagged block (the plugin docs router carries its own tag). */
const alreadyTagged = (text: string): boolean => /^<([a-z][a-z0-9_-]*)>[\s\S]*<\/\1>\s*$/u.test(text.trim())

/**
 * Shape the harness's assembled sections the way pi.dev's `buildSystemPromptSections` shapes its own: an untagged opening identity line,
 * then every other section as a tagged block, with empty sections dropped. Nothing else is rewritten: every section that is not the
 * identity passes through with its upstream text unchanged, so upstream improvements to tool guidance still reach the model.
 * @param sections - upstream sections in final order.
 */
export function shapeSections(sections: readonly PromptSection[], options: ShapeOptions = {}): PromptSection[] {
  const identity = options.identity ?? DEFAULT_IDENTITY
  const tagSections = options.tagSections ?? true
  const dropEmpty = options.dropEmpty ?? true
  const out: PromptSection[] = []
  for (const section of sections) {
    if (section.name === IDENTITY_SECTION) {
      out.push({ name: section.name, text: identity })
      continue
    }
    const text = String(section.text ?? '')
    if (dropEmpty && text.trim() === '') continue
    if (!tagSections || alreadyTagged(text)) {
      out.push({ name: section.name, text })
      continue
    }
    const tag = tagName(section.name)
    out.push({ name: section.name, text: `<${tag}>\n${text.trim()}\n</${tag}>` })
  }
  return out
}

/** Text that legitimately differs per run (the web surface section names its random local port) must not look like drift. */
export function normalizeVolatile(text: string): string {
  return String(text ?? '').replace(/\b(127\.0\.0\.1|localhost|0\.0\.0\.0):\d+/gu, '$1:<port>')
}

/**
 * What upstream contributed, for drift detection: name and a short hash of the text, excluding ACRYL's own sections (they carry
 * machine-specific paths and are ours to change). Variables such as `{{cwd}}` are not yet interpolated at this stage, so the hashes are stable.
 */
export function upstreamSnapshot(sections: readonly PromptSection[]): { name: string; hash: string }[] {
  return sections
    .filter(section => !section.name.startsWith('acryl:'))
    .map(section => ({ name: section.name, hash: createHash('sha256').update(normalizeVolatile(section.text)).digest('hex').slice(0, 12) }))
}
