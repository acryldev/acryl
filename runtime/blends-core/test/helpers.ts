import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import type { BlendDocument } from '../src/document.js'
import { parseDefinition } from '../src/parse.js'
import { validateDefinition, type ValidationMode } from '../src/validate.js'

export const testRoot = fileURLToPath(new URL('.', import.meta.url))

export function loadFixture(relPath: string): string {
  return readFileSync(`${testRoot}fixtures/${relPath}`, 'utf8')
}

export const GOLDEN = {
  zero: 'golden/acryl.zero.yaml',
  crm: 'golden/acryl.crm.yaml',
  acme: 'golden/acme.crm.yaml',
} as const

/**
 * Loads a fixture through the real parse+validate boundary and asserts it is
 * clean, so resolve/compile specs fail on their own assertions instead of a
 * malformed fixture. Distribution mode by default; pass 'local-authoring'
 * for !!js fixtures.
 */
export function loadValidDefinition(relPath: string, mode: ValidationMode = 'distribution'): BlendDocument {
  const { document, diagnostics: parseDiagnostics } = parseDefinition(loadFixture(relPath))
  const diagnostics = [...parseDiagnostics, ...validateDefinition(document, mode)]
  if (diagnostics.length > 0) {
    throw new Error(`fixture ${relPath} does not load clean: ${JSON.stringify(diagnostics)}`)
  }
  return document as BlendDocument
}
