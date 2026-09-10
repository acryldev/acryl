// BLEND lock consumption (spec 003, D22-D27): strict lock guards, path
// resolution, the insert patch projection, and collision rejection.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'

import {
  assertNoBlendRowCollisions,
  blendInsertPatch,
  blendRowIds,
  parseBlendLock,
  readDesktopBlend,
  resolveBlendLockPath,
} from '../src/desktop-blend.ts'

const FIXTURE_LOCK_DIR = fileURLToPath(new URL('./fixtures/blend/acryl-crm', import.meta.url))

function validLock(): Record<string, unknown> {
  return {
    formatVersion: 1,
    generator: { name: '@acryl/blends-core', version: '0.1.0' },
    origin: {
      id: 'acryl.crm',
      kind: 'Blueprint',
      version: '0.1.0',
      digest: `sha256:${'a'.repeat(64)}`,
    },
    rows: [
      { id: 'contacts', name: '@acryl/contacts', config: { title: 'Contacts' } },
      { id: 'invoicing', name: '@acryl/invoicing', disabled: true },
    ],
  }
}

function root(): string {
  return mkdtempSync(join(tmpdir(), 'dsh-desktop-blend-'))
}

describe('parseBlendLock', () => {
  it('projects a well-formed lock with frozen rows carrying config and disabled', () => {
    const projection = parseBlendLock(validLock(), '/tmp/lock.json')
    expect(projection.lockPath).toBe('/tmp/lock.json')
    expect(projection.generator).toEqual({ name: '@acryl/blends-core', version: '0.1.0' })
    expect(projection.origin).toEqual({
      id: 'acryl.crm',
      kind: 'Blueprint',
      version: '0.1.0',
      digest: `sha256:${'a'.repeat(64)}`,
    })
    expect(projection.rows).toEqual([
      { id: 'contacts', name: '@acryl/contacts', config: { title: 'Contacts' } },
      { id: 'invoicing', name: '@acryl/invoicing', disabled: true },
    ])
    expect(Object.isFrozen(projection)).toBe(true)
  })

  it('rejects wrong shapes with the lock path named', () => {
    const lockPath = '/tmp/blend.lock.json'
    expect(() => parseBlendLock(null, lockPath)).toThrow('/tmp/blend.lock.json')
    expect(() => parseBlendLock({ ...validLock(), extra: true }, lockPath))
      .toThrow('exactly the keys')
    expect(() => parseBlendLock({ ...validLock(), formatVersion: 2 }, lockPath))
      .toThrow('formatVersion 2')
    expect(() => parseBlendLock({ ...validLock(), generator: { name: 'x' } }, lockPath))
      .toThrow('generator')
    expect(() => parseBlendLock({ ...validLock(), origin: { ...validLock().origin as object, kind: 'Struct' } }, lockPath))
      .toThrow("expected 'Blueprint' or 'Blend'")
    expect(() => parseBlendLock({ ...validLock(), origin: { ...validLock().origin as object, digest: 'deadbeef' } }, lockPath))
      .toThrow('digest')
    expect(() => parseBlendLock({ ...validLock(), rows: 'contacts' }, lockPath))
      .toThrow('rows that are not an array')
    expect(() => parseBlendLock({ ...validLock(), rows: [{ id: 'x', name: '@a/b', extra: 1 }] }, lockPath))
      .toThrow("unknown key 'extra'")
    expect(() => parseBlendLock({ ...validLock(), rows: [{ id: 'x', name: '@a/b', disabled: 'yes' }] }, lockPath))
      .toThrow('disabled is not a boolean')
    expect(() => parseBlendLock({ ...validLock(), rows: [{ id: 'x', name: '@a/b', config: [] }] }, lockPath))
      .toThrow('config is not a map')
    expect(() => parseBlendLock({ ...validLock(), rows: [{ id: '', name: '@a/b' }] }, lockPath))
      .toThrow('row id')
  })
})

describe('readDesktopBlend', () => {
  it('reads the committed acryl.crm fixture lock through its Blend directory', () => {
    const projection = readDesktopBlend(FIXTURE_LOCK_DIR)
    expect(projection.origin.id).toBe('acryl.crm')
    expect(projection.origin.kind).toBe('Blueprint')
    expect(projection.rows.map(row => row.id)).toEqual(['contacts', 'tasks', 'pipeline', 'invoicing'])
    expect(projection.rows.find(row => row.id === 'invoicing')?.disabled).toBe(true)
    expect(projection.rows.find(row => row.id === 'contacts')?.config).toEqual({
      title: 'Contacts',
      org: 'My Organization',
      greeting: 'Hello from My Organization',
    })
  })

  it('reads a lock file path directly and rejects missing paths and missing locks', () => {
    const dir = root()
    const lockPath = join(dir, 'custom.lock.json')
    writeFileSync(lockPath, JSON.stringify(validLock()))
    expect(readDesktopBlend(lockPath).origin.id).toBe('acryl.crm')

    expect(() => readDesktopBlend(join(dir, 'missing'))).toThrow('BLEND path')
    expect(() => readDesktopBlend(FIXTURE_LOCK_DIR.replace('acryl-crm', 'no-such-dir')))
      .toThrow('does not exist')

    // A directory without its .acryl lock names the resolved lock file.
    const emptyBlend = join(dir, 'empty-blend')
    mkdirSync(emptyBlend, { recursive: true })
    expect(() => readDesktopBlend(emptyBlend)).toThrow('empty-blend/.acryl/blend.lock.json')
  })
})

describe('resolveBlendLockPath', () => {
  it('resolves a Blend directory to its .acryl lock and passes files through', () => {
    expect(resolveBlendLockPath(FIXTURE_LOCK_DIR)).toBe(join(FIXTURE_LOCK_DIR, '.acryl/blend.lock.json'))
    const dir = root()
    const file = join(dir, 'direct.json')
    writeFileSync(file, '{}')
    expect(resolveBlendLockPath(file)).toBe(file)
    expect(() => resolveBlendLockPath(join(dir, 'absent'))).toThrow('does not exist')
  })
})

describe('blendInsertPatch and blendRowIds', () => {
  it('projects rows into one insert patch preserving config and disabled', () => {
    const projection = parseBlendLock(validLock(), '/tmp/lock.json')
    expect(blendInsertPatch(projection)).toEqual({
      insert: [
        { id: 'contacts', name: '@acryl/contacts', config: { title: 'Contacts' } },
        { id: 'invoicing', name: '@acryl/invoicing', disabled: true },
      ],
    })
    expect(blendRowIds(projection)).toEqual(new Set(['contacts', 'invoicing']))
  })
})

describe('assertNoBlendRowCollisions', () => {
  it('rejects a blend row that collides with a base row and attributes the error to the blend', () => {
    const projection = parseBlendLock(validLock(), '/tmp/lock.json')
    const baseRows: Array<{ id: unknown, name?: string }> = [
      { id: 'contacts', name: '@other/contacts' },
      { id: 'webserver', name: 'acryl-desktop/webserver' },
    ]
    expect(() => assertNoBlendRowCollisions(projection, baseRows))
      .toThrow("BLEND 'acryl.crm' row 'contacts' collides")
    expect(() => assertNoBlendRowCollisions(projection, baseRows.slice(1)))
      .not.toThrow()
  })

  it('ignores base rows whose id is not a string', () => {
    const projection = parseBlendLock(validLock(), '/tmp/lock.json')
    expect(() => assertNoBlendRowCollisions(projection, [{ id: undefined } as never])).not.toThrow()
  })
})
