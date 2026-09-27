// Public-surface spec (T015): everything consumers get must come from the
// barrel. This spec imports @acryl/blends-core's surface only through
// src/index.js - never from an implementation module.
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import * as blends from '../../src/index.js'

const packageRoot = fileURLToPath(new URL('../..', import.meta.url))
const packageJson = JSON.parse(readFileSync(`${packageRoot}/package.json`, 'utf8')) as {
  exports: Record<string, unknown>
}

describe('public surface (contracts/blends-core.api.md)', () => {
  it('exports the five contract functions', () => {
    expect(typeof blends.parseDefinition).toBe('function')
    expect(typeof blends.validateDefinition).toBe('function')
    expect(typeof blends.resolveDefinition).toBe('function')
    expect(typeof blends.compileDefinition).toBe('function')
    expect(typeof blends.inspectDefinition).toBe('function')
  })

  it('drives the full pipeline through the barrel alone', () => {
    const source = readFileSync(`${packageRoot}test/fixtures/golden/acryl.crm.yaml`, 'utf8')
    const parsed = blends.parseDefinition(source)
    expect(parsed.diagnostics).toEqual([])
    const document = parsed.document as blends.BlendDocument
    expect(blends.validateDefinition(document, 'distribution')).toEqual([])
    const { definition, diagnostics } = blends.resolveDefinition(document)
    expect(diagnostics).toEqual([])
    expect(definition).not.toBeNull()
    const { patch, diagnostics: compileDiagnostics } = blends.compileDefinition(definition!)
    expect(compileDiagnostics).toEqual([])
    expect(patch?.yaml).toContain('insert')
    const summary: blends.BlendSummary = blends.inspectDefinition(document)
    expect(summary.id).toBe('acryl.crm')
    // Key public types exist at compile time and carry the format version.
    const apiVersion: blends.FormatApiVersion = blends.BLENDS_API_VERSION
    expect(apiVersion).toBe('blends.acryl.dev/v1alpha1')
  })

  it('exposes the schema artifact path and contents for hub reuse', () => {
    expect(blends.BLEND_MANIFEST_SCHEMA_PATH).toBe('./schema/blend-manifest.v1alpha1.schema.json')
    expect(blends.BLEND_MANIFEST_SCHEMA).toMatchObject({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
    })
    expect(existsSync(`${packageRoot}src/schema/blend-manifest.v1alpha1.schema.json`)).toBe(true)
  })

  it('declares an exports map for the barrel and the schema artifact', () => {
    expect(Object.keys(packageJson.exports).sort()).toEqual([
      '.',
      './schema/blend-manifest.v1alpha1.schema.json',
    ])
    expect(packageJson.exports['.']).toEqual({
      types: './dist/index.d.ts',
      default: './dist/index.js',
    })
  })
})
