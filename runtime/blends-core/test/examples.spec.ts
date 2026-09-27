// The published starter recipes under examples/ must stay valid and must compile to the rows ACRYL's runtime composes
// (ACRYL spec 036): a recipe that no longer validates or drifts from the runtime is a broken default state.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { BlendDocument } from '../src/document.js'
import { compileDefinition } from '../src/compile.js'
import { parseDefinition } from '../src/parse.js'
import { resolveDefinition } from '../src/resolve.js'
import { validateDefinition } from '../src/validate.js'

const EXAMPLES = resolve(import.meta.dirname, '../../../examples/blends')

function load(file: string): BlendDocument {
  const { document, diagnostics } = parseDefinition(readFileSync(resolve(EXAMPLES, file), 'utf8'))
  expect(diagnostics, file).toEqual([])
  expect(validateDefinition(document, 'distribution'), file).toEqual([])
  return document as BlendDocument
}

describe('starter recipes', () => {
  it('the blank Blueprint composes the stem-cell rows and honors its brand parameters', () => {
    const { definition, diagnostics } = resolveDefinition(load('acryl.blank.yaml'), { overrides: { brandName: 'Orbit' } })
    expect(diagnostics).toEqual([])
    const { patch, diagnostics: compileDiagnostics } = compileDefinition(definition!)
    expect(compileDiagnostics).toEqual([])
    const rows = (patch!.ops as unknown as { insert: { id: string, config?: { name?: string } }[] }[]).flatMap(entry => entry.insert)
    expect(rows.map(row => row.id)).toEqual(['brand', 'extension-context', 'acryl-system-prompt', '@acryl/ui', 'acryl-app-save'])
    expect(rows[0]?.config?.name).toBe('Orbit')
  })

  it('the organizer Blend names the blank Blueprint as its lineage and adds exactly one plugin', () => {
    const blank = load('acryl.blank.yaml')
    const organizer = load('acryl.organizer.yaml')
    expect(organizer.spec.lineage).toEqual({ blueprint: 'acryl.blank', blueprintVersion: '0.1.0' })
    const blankIds = (blank.spec.rows ?? []).map(row => row.id)
    const added = (organizer.spec.rows ?? []).map(row => row.id).filter(id => !blankIds.includes(id))
    expect(added).toEqual(['acryl-organizer'])
  })
})
