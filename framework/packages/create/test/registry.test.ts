import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { manifestName, ownLock, ownManifest, profileNameFor, starterName } from '../src/registry'

const STARTER = [
  'apiVersion: blends.acryl.dev/v1alpha1',
  'kind: Blueprint',
  'metadata:',
  '  id: inboxxobni.notes',
  '  name: "notes"',
  '  version: 0.1.0',
  '  license: MIT',
  '  visibility: public',
  'spec:',
  '  rows: []',
  '',
].join('\n')

describe('a pulled starter becomes the new app', () => {
  it('names the app in its manifest, private and unlicensed', () => {
    const owned = ownManifest(STARTER, 'my-notes')
    expect(owned).toMatch(/^ {2}id: acrylblends\.my-notes$/m)
    expect(owned).toMatch(/^ {2}name: my-notes$/m)
    expect(owned).toMatch(/^ {2}visibility: private$/m)
    expect(owned).not.toMatch(/license/)
  })

  it('keeps its lock true to that manifest, and leaves a lock it cannot read alone', () => {
    const owned = ownManifest(STARTER, 'my-notes')
    const modules = [
      { name: 'notes', origin: 'local', digest: 'sha256:abc', source: 'plugins/notes' },
    ]
    const lock = JSON.parse(
      ownLock(
        JSON.stringify({
          formatVersion: 3,
          origin: { id: 'inboxxobni.notes', kind: 'Blueprint', version: '0.1.0', digest: 'old' },
          modules,
        }),
        owned,
        'my-notes',
      ),
    )
    expect(lock.origin).toEqual({
      id: 'acrylblends.my-notes',
      kind: 'Blueprint',
      version: '0.1.0',
      digest: createHash('sha256').update(owned).digest('hex'),
    })
    expect(lock.modules).toEqual(modules)
    expect(ownLock('not json', owned, 'my-notes')).toBe('not json')
    expect(ownLock('{"formatVersion":3}', owned, 'my-notes')).toBe('{"formatVersion":3}')
  })
})

describe("a starter's own name", () => {
  it('is read from its manifest only when it is one word, quoted or not', () => {
    expect(manifestName(STARTER)).toBe('notes')
    expect(manifestName('metadata:\n  id: x.y\n  name: my-app # mine\n')).toBe('my-app')
    expect(manifestName('metadata:\n  name: Notes with a desktop window\n')).toBeUndefined()
    expect(manifestName('spec:\n  name: notes\n')).toBeUndefined()
  })

  it('falls back to its package name when the manifest carries a display name', () => {
    const titled = 'metadata:\n  name: Productivity Hub\n'
    expect(starterName(titled, '{ "name": "productivity-hub" }')).toBe('productivity-hub')
    expect(starterName(STARTER, '{ "name": "x" }')).toBe('notes')
    expect(starterName(titled, undefined)).toBeUndefined()
    expect(starterName(titled, 'not json')).toBeUndefined()
    expect(starterName(titled, '{ "name": "" }')).toBeUndefined()
  })

  it("names the app's DSH profile the way the scaffold does", () => {
    expect(profileNameFor('My Notes!')).toBe('acrylblends-my-notes')
    expect(profileNameFor('---')).toBe('acrylblends-app')
  })
})
