// Lock spec (M2 T001-T002): generateLock round-trips the golden fixtures and
// is byte-deterministic (SC-M2-1). The lock records resolved state - origin
// identity plus rows - so its rows must equal the definition's resolved rows.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { resolveDefinition } from '../../src/resolve.js'
import { BLENDS_CORE_VERSION, generateBlendLock, generateLock } from '../../src/lock.js'
import { GOLDEN, loadValidDefinition } from '../helpers.js'

const packageJson = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { version: string }

describe('generateLock (FR-M2-1, FR-M2-2)', () => {
  it('round-trips acryl.crm: lock rows equal the resolved rows, origin carries identity', () => {
    const doc = loadValidDefinition(GOLDEN.crm)
    const { definition } = resolveDefinition(doc)
    expect(definition).not.toBeNull()
    const { lock, json } = generateLock(definition!, {
      id: doc.metadata.id,
      kind: doc.kind,
      version: doc.metadata.version,
      digest: 'sha256:deadbeef',
    })
    expect(lock.formatVersion).toBe(1)
    expect(lock.generator).toEqual({ name: '@webboxes/blends-core', version: BLENDS_CORE_VERSION })
    expect(lock.origin).toEqual({
      id: 'acryl.crm',
      kind: 'Blueprint',
      version: '0.1.0',
      digest: 'sha256:deadbeef',
    })
    expect(lock.rows).toEqual(definition!.spec.rows)
    // Resolved state: parameter tokens are substituted, never recorded.
    expect(JSON.stringify(lock)).not.toContain('{{parameters.')
    // Deterministic text: 2-space indent, trailing newline.
    expect(json).toBe(`${JSON.stringify(lock, null, 2)}\n`)
  })

  it('round-trips acme.crm: the owned-state rows include inherited parent rows in order', () => {
    const crm = loadValidDefinition(GOLDEN.crm)
    const acme = loadValidDefinition(GOLDEN.acme)
    const { definition } = resolveDefinition(acme, {
      getDefinition: (id) => (id === crm.metadata.id ? crm : undefined),
    })
    expect(definition).not.toBeNull()
    const { lock } = generateLock(definition!, {
      id: acme.metadata.id,
      kind: acme.kind,
      version: acme.metadata.version,
      digest: 'sha256:acme',
    })
    expect(lock.origin).toEqual({
      id: 'acme.crm',
      kind: 'Blend',
      version: expect.any(String),
      digest: 'sha256:acme',
    })
    expect(lock.rows.map((row) => row.id)).toEqual([
      'contacts',
      'tasks',
      'pipeline',
      'invoicing',
      'brand',
    ])
  })

  it('generates byte-identical output for repeated generation of the same state (SC-M2-1)', () => {
    const doc = loadValidDefinition(GOLDEN.crm)
    const { definition } = resolveDefinition(doc)
    const first = generateLock(definition!, {
      id: doc.metadata.id,
      kind: doc.kind,
      version: doc.metadata.version,
      digest: 'sha256:same',
    })
    const second = generateLock(definition!, {
      id: doc.metadata.id,
      kind: doc.kind,
      version: doc.metadata.version,
      digest: 'sha256:same',
    })
    expect(second.json).toBe(first.json)
    expect(first.json.length).toBeGreaterThan(0)
  })

  it('keeps BLENDS_CORE_VERSION in lockstep with the package version', () => {
    expect(BLENDS_CORE_VERSION).toBe(packageJson.version)
  })
})

describe('generateLock v2 (spec-004, FR-M4-1, FR-M4-2)', () => {
  const origin = { id: 'acryl.crm', kind: 'Blueprint' as const, version: '0.1.0', digest: 'sha256:deadbeef' }

  it('omitting modules still produces v1, unchanged (SC-M4-2)', () => {
    const doc = loadValidDefinition(GOLDEN.crm)
    const { definition } = resolveDefinition(doc)
    const { lock } = generateLock(definition!, origin)
    expect(lock.formatVersion).toBe(1)
    expect('modules' in lock).toBe(false)
  })

  it('passing modules produces v2 with rows unchanged from v1', () => {
    const doc = loadValidDefinition(GOLDEN.crm)
    const { definition } = resolveDefinition(doc)
    const v1 = generateLock(definition!, origin)
    const v2 = generateLock(definition!, origin, undefined, [
      { name: 'acryl-ui', origin: 'registry', version: '0.3.0', digest: 'sha256:abc' },
    ])
    expect(v2.lock.formatVersion).toBe(2)
    expect(v2.lock.rows).toEqual(v1.lock.rows)
    if (v2.lock.formatVersion === 2) {
      expect(v2.lock.modules).toEqual([{ name: 'acryl-ui', origin: 'registry', version: '0.3.0', digest: 'sha256:abc' }])
    }
  })

  it('sorts modules by name regardless of input order, deterministically (SC-M4-1)', () => {
    const doc = loadValidDefinition(GOLDEN.crm)
    const { definition } = resolveDefinition(doc)
    const a = generateLock(definition!, origin, undefined, [
      { name: 'zeta', origin: 'git', spec: 'git+https://example.test/zeta' },
      { name: 'alpha', origin: 'local', version: '0.1.0', digest: 'sha256:1', source: '.acryl-plugins/alpha' },
    ])
    const b = generateLock(definition!, origin, undefined, [
      { name: 'alpha', origin: 'local', version: '0.1.0', digest: 'sha256:1', source: '.acryl-plugins/alpha' },
      { name: 'zeta', origin: 'git', spec: 'git+https://example.test/zeta' },
    ])
    expect(a.json).toBe(b.json)
    if (a.lock.formatVersion === 2) expect(a.lock.modules.map(m => m.name)).toEqual(['alpha', 'zeta'])
  })
})

describe('generateBlendLock (formatVersion 3, spec 036)', () => {
  const doc = loadValidDefinition(GOLDEN.crm)
  const { definition } = resolveDefinition(doc)
  const origin = { id: 'acme.gtd', kind: 'Blend' as const, version: '0.4.0', digest: 'sha256:aa' }
  const local = { name: 'gtd-board', origin: 'local' as const, version: '0.2.0', digest: 'sha256:bb', source: 'src/plugins/gtd-board' }
  const pulled = { name: 'acryl-quick-notes', origin: 'pulled' as const, version: '0.3.0', spec: 'github:inboxxobni/acryl-quick-notes@0.3.0', digest: 'sha512-cc' }

  it('writes lineage, parameters, rows and modules in a fixed order', () => {
    const { lock, json } = generateBlendLock({
      resolved: definition!,
      origin,
      lineage: { blueprint: 'acryl.gtd', blueprintVersion: '0.1.0', digest: 'sha256:dd' },
      parameters: { zeta: 1, accent: '#e8590c' },
      modules: [local, pulled],
    })
    expect(lock.formatVersion).toBe(3)
    expect(Object.keys(lock)).toEqual(['formatVersion', 'generator', 'origin', 'lineage', 'parameters', 'rows', 'modules'])
    expect(lock).toMatchObject({
      generator: { name: '@webboxes/blends-core', version: BLENDS_CORE_VERSION },
      lineage: { blueprint: 'acryl.gtd', blueprintVersion: '0.1.0', digest: 'sha256:dd' },
      rows: definition!.spec.rows,
      modules: [pulled, local],
    })
    expect(Object.keys((lock as { parameters: object }).parameters)).toEqual(['accent', 'zeta'])
    expect(json.endsWith('}\n')).toBe(true)
  })

  it('is byte-deterministic regardless of input order and leaves lineage out for a Blueprint', () => {
    const one = generateBlendLock({ resolved: definition!, origin, modules: [local, pulled], parameters: { b: 1, a: 2 } })
    const two = generateBlendLock({ resolved: definition!, origin, modules: [pulled, local], parameters: { a: 2, b: 1 } })
    expect(one.json).toBe(two.json)
    expect(one.lock).not.toHaveProperty('lineage')
    expect(generateBlendLock({ resolved: definition!, origin, modules: [] }).lock).toMatchObject({ parameters: {}, modules: [] })
  })
})
