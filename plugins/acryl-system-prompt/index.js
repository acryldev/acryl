/**
 * ACRYL system prompt shaping (spec 037, pi.dev-like prompt). pi.dev owns one builder function that produces a structured, tagged prompt; ACRYL
 * composes its prompt from the harness's sections (a pinned upstream we do not fork), so this plugin applies the same shape as a pass-through:
 * on the harness's `system-prompt/assemble` waterfall it puts the ACRYL identity first, wraps every other section in a tag, drops empty ones, and
 * records what upstream contributed so a harness update shows exactly what changed. It rewrites nothing else.
 *
 * Provides: `acrylSystemPrompt` ({ lastUpstream() }). Requires: `systemPrompt`.
 */
import Schema from '@deepseek-ai/schemastery'
import { DEFAULT_IDENTITY, shapeSections, upstreamSnapshot } from './lib/transform.js'

export const name = 'acryl-system-prompt'
export const inject = ['systemPrompt']

export const Config = Schema.object({
  identity: Schema.string().default(DEFAULT_IDENTITY).description('The opening identity line (replaces the harness "You are an AI agent powered by ..." line).'),
  tagSections: Schema.boolean().default(true).description('Wrap every section in a pi.dev-style tag.'),
  dropEmpty: Schema.boolean().default(true).description('Drop sections with no text.'),
})

export function apply(ctx, config) {
  let upstream = []
  ctx.provide('acrylSystemPrompt', { lastUpstream: () => upstream })
  ctx.effect(() => ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
    const assembled = await next()
    upstream = upstreamSnapshot(assembled.sections)
    return { ...assembled, sections: shapeSections(assembled.sections, config) }
  }), 'acryl-system-prompt: assemble listener')
}
