/**
 * ACRYL system prompt shaping (ACRYL spec 037, pi.dev-like prompt). pi.dev owns one builder function that produces a structured, tagged prompt; the
 * frame composes its agent's prompt from the harness's sections (a pinned upstream we do not fork), so this plugin applies the same shape as a
 * pass-through: on the harness's `system-prompt/assemble` waterfall it puts the identity first, wraps every other section in a tag, drops empty ones,
 * and records what upstream contributed so a harness update shows exactly what changed. It rewrites nothing else.
 *
 * It also contributes one section of its own, the reply style (`acryl:reply-style`, tagged `<reply_style>`): plain words and no em dash.
 *
 * Provides: `acrylSystemPrompt` ({ lastUpstream() }) and the reply style section. Requires: `systemPrompt`.
 */
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { DEFAULT_IDENTITY, DEFAULT_STYLE, type PromptSection, STYLE_SECTION, shapeSections, upstreamSnapshot } from './transform.ts'

export const name = 'acryl-system-prompt'
export const inject = ['systemPrompt']

export interface Config {
  identity: string
  style: string
  tagSections: boolean
  dropEmpty: boolean
}

export const Config: Schema<Config> = Schema.object({
  identity: Schema.string().default(DEFAULT_IDENTITY).description('The opening identity line (replaces the harness "You are an AI agent powered by ..." line).'),
  style: Schema.string().default(DEFAULT_STYLE).description('How the agent writes its replies; empty leaves the section out.'),
  tagSections: Schema.boolean().default(true).description('Wrap every section in a pi.dev-style tag.'),
  dropEmpty: Schema.boolean().default(true).description('Drop sections with no text.'),
})

/** The assembled prompt as the waterfall passes it: its sections, and whatever else the harness carries, kept as it is. */
interface Assembled {
  readonly sections: readonly PromptSection[]
}

interface SystemPrompt {
  section(section: { name: string; order: number; text: string }): () => void
}

type AssembleListener = (assembly: unknown, context: unknown, next: () => Promise<Assembled>) => Promise<Assembled>

export function apply(ctx: Context, config: Config): void {
  let upstream: { name: string; hash: string }[] = []
  ctx.provide('acrylSystemPrompt', { lastUpstream: () => upstream })
  const systemPrompt = (ctx as unknown as { systemPrompt: SystemPrompt }).systemPrompt
  if (config.style.trim() !== '')
    ctx.effect(() => systemPrompt.section({ ...STYLE_SECTION, text: config.style }), 'acryl-system-prompt: reply style')
  const on = ctx.on.bind(ctx) as unknown as (name: 'system-prompt/assemble', listener: AssembleListener) => () => void
  ctx.effect(() => on('system-prompt/assemble', async (_assembly, _context, next) => {
    const assembled = await next()
    upstream = upstreamSnapshot(assembled.sections)
    return { ...assembled, sections: shapeSections(assembled.sections, config) }
  }), 'acryl-system-prompt: assemble listener')
}
