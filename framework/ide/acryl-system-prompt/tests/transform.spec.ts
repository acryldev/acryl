import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import * as plugin from '../src/index.ts'
import { DEFAULT_IDENTITY, DEFAULT_STYLE, normalizeVolatile, shapeSections, tagName, upstreamSnapshot } from '../src/transform.ts'

const sections = [
  { name: 'harness:identity', text: 'You are an AI agent powered by DeepSeek Harness.' },
  { name: 'deployment:persona-prefix', text: 'You are a coding agent powered by {{model}}.' },
  { name: 'plan:policy', text: '' },
  { name: 'tool:read', text: 'Use the read tool - not cat.' },
  { name: 'acryl:plugin-router', text: '<acryl_plugin_docs>\nroute\n</acryl_plugin_docs>' },
  { name: 'deployment:persona-suffix', text: 'Your working directory is {{cwd}}.' },
]

describe('the prompt shape', () => {
  it('the identity replaces the harness identity, first and untagged, and names the Blends app', () => {
    const out = shapeSections(sections)
    expect(out[0]).toEqual({ name: 'harness:identity', text: DEFAULT_IDENTITY })
    expect(DEFAULT_IDENTITY).toMatch(/ACRYL Blends app/)
    expect(DEFAULT_IDENTITY).toMatch(/blend\.yaml/)
    expect(out.map(s => s.text).join('\n')).not.toMatch(/powered by DeepSeek Harness/)
  })

  it('tags every other section pi-style, drops empties and passes upstream text through unchanged', () => {
    const out = shapeSections(sections)
    expect(out.map(s => s.name)).toEqual(['harness:identity', 'deployment:persona-prefix', 'tool:read', 'acryl:plugin-router', 'deployment:persona-suffix'])
    expect(out[1]?.text).toBe('<persona>\nYou are a coding agent powered by {{model}}.\n</persona>')
    expect(out[2]?.text).toBe('<tool_read>\nUse the read tool - not cat.\n</tool_read>')
    expect(out[4]?.text).toBe('<cwd>\nYour working directory is {{cwd}}.\n</cwd>')
  })

  it('does not wrap an already tagged section twice', () => {
    const router = shapeSections(sections).find(s => s.name === 'acryl:plugin-router')
    expect((router?.text.match(/<acryl_plugin_docs>/gu) ?? []).length).toBe(1)
  })

  it('turns tagging and dropping off and sets the identity by option', () => {
    const out = shapeSections(sections, { identity: 'You are X.', tagSections: false, dropEmpty: false })
    expect(out.length).toBe(sections.length)
    expect(out[0]?.text).toBe('You are X.')
    expect(out[3]?.text).toBe('Use the read tool - not cat.')
  })

  it('makes safe tag names', () => {
    expect(tagName('tool:web_fetch')).toBe('tool_web_fetch')
    expect(tagName('ui:deliverable-file-references')).toBe('ui_deliverable-file-references')
    expect(tagName('123:x')).toBe('x')
    expect(tagName('deployment:persona-suffix')).toBe('cwd')
  })

  it('records upstream without ACRYL sections, and a text change changes its hash', () => {
    const a = upstreamSnapshot(sections)
    expect(a.some(s => s.name.startsWith('acryl:'))).toBe(false)
    const b = upstreamSnapshot(sections.map(s => (s.name === 'tool:read' ? { ...s, text: 'changed' } : s)))
    expect(a.find(s => s.name === 'tool:read')).not.toEqual(b.find(s => s.name === 'tool:read'))
    expect(a.find(s => s.name === 'tool:read')?.hash.length).toBe(12)
  })

  it('does not count a run-specific local port as drift', () => {
    expect(normalizeVolatile('open http://127.0.0.1:51234/x and localhost:3080')).toBe('open http://127.0.0.1:<port>/x and localhost:<port>')
    expect(upstreamSnapshot([{ name: 'app:web-surface', text: 'GUI at http://127.0.0.1:51234' }]))
      .toEqual(upstreamSnapshot([{ name: 'app:web-surface', text: 'GUI at http://127.0.0.1:60000' }]))
  })
})

describe('the plugin', () => {
  it('shapes the assembled prompt on the waterfall and lets go when disposed', async () => {
    const root = new Context()
    const contributed: { name: string; order: number; text: string }[] = []
    root.provide('systemPrompt', {
      section(section: { name: string; order: number; text: string }) {
        contributed.push(section)
        return () => { contributed.splice(contributed.indexOf(section), 1) }
      },
    })
    const fiber = root.plugin(plugin, { identity: 'You build this app.', style: DEFAULT_STYLE, tagSections: true, dropEmpty: true })
    await fiber.await()
    const assemble = () => (root as unknown as { waterfall(name: string, ...args: unknown[]): Promise<{ sections: { name: string; text: string }[] }> })
      .waterfall('system-prompt/assemble', {}, {}, async () => ({ sections }))
    const shaped = await assemble()
    expect(shaped.sections[0]?.text).toBe('You build this app.')
    expect((root as unknown as { acrylSystemPrompt: { lastUpstream(): unknown[] } }).acrylSystemPrompt.lastUpstream().length).toBe(5)
    await fiber.dispose()
    expect((await assemble()).sections).toBe(sections)
    expect(contributed).toEqual([])
  })

  it('asks for replies without an em dash, right after the identity, and leaves the section out when the style is empty', async () => {
    expect(DEFAULT_STYLE).toMatch(/Never use the em dash/)
    expect(DEFAULT_STYLE).not.toMatch(/[\u2013\u2014]/u)
    expect(tagName('acryl:reply-style')).toBe('reply_style')
    for (const style of [DEFAULT_STYLE, '']) {
      const root = new Context()
      const contributed: { name: string; order: number; text: string }[] = []
      root.provide('systemPrompt', { section: (section: { name: string; order: number; text: string }) => { contributed.push(section); return () => {} } })
      const fiber = root.plugin(plugin, { identity: 'x', style, tagSections: true, dropEmpty: true })
      await fiber.await()
      expect(contributed).toEqual(style === '' ? [] : [{ name: 'acryl:reply-style', order: -900, text: DEFAULT_STYLE }])
      await fiber.dispose()
    }
  })
})
