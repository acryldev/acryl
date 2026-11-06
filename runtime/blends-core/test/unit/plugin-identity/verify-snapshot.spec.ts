// verifySnapshot: an app or registry entry is what its lock says (spec 049, portable-plugins.md step 4).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { manifestDigest } from '../../../src/digest.js'
import { digestFolder } from '../../../src/plugin-identity/folder-digest.js'
import { snapshotProblems, verifySnapshot } from '../../../src/plugin-identity/verify-snapshot.js'

const created: string[] = []
afterEach(() => {
  for (const root of created.splice(0)) rmSync(root, { recursive: true, force: true })
})

const MANIFEST = 'kind: Blueprint\n'

function snapshot(source = 'plugins/notes'): string {
  const root = mkdtempSync(join(tmpdir(), 'blends-snapshot-'))
  created.push(root)
  mkdirSync(join(root, 'plugins', 'notes'), { recursive: true })
  writeFileSync(join(root, 'plugins', 'notes', 'index.ts'), 'export {}\n')
  writeFileSync(join(root, 'blend.yaml'), MANIFEST)
  writeFileSync(
    join(root, 'blend.lock.json'),
    JSON.stringify({
      formatVersion: 3,
      origin: { digest: manifestDigest(MANIFEST) },
      modules: [
        { name: 'notes', origin: 'local', source, digest: `sha256:${digestFolder(join(root, 'plugins', 'notes'))}` },
        { name: 'router', origin: 'registry', digest: 'sha512-whatever' },
      ],
    }),
  )
  return root
}

describe('verifySnapshot', () => {
  it('accepts a snapshot that is what its lock says, counting the manifest and each local plugin', () => {
    expect(verifySnapshot(snapshot())).toEqual({ ok: true, problems: [], checked: 2 })
  })

  it('names a manifest changed after the capture', () => {
    const root = snapshot()
    writeFileSync(join(root, 'blend.yaml'), `${MANIFEST}# edited\n`)
    expect(verifySnapshot(root).problems).toEqual(['blend.yaml changed since the lock was written (its digest no longer matches): capture again'])
  })

  it('names a plugin changed after the capture', () => {
    const root = snapshot()
    writeFileSync(join(root, 'plugins', 'notes', 'index.ts'), 'export { }\n')
    expect(verifySnapshot(root).problems).toEqual(['notes: plugins/notes differs from the locked digest (edited after the capture)'])
  })

  it('names a missing plugin, and refuses a lock that points outside the plugin folders without reading there', () => {
    const root = snapshot()
    rmSync(join(root, 'plugins', 'notes'), { recursive: true })
    expect(verifySnapshot(root).problems).toEqual(['notes: plugins/notes is missing'])
    expect(verifySnapshot(snapshot('../elsewhere')).problems).toEqual(['notes: the lock places it at ../elsewhere, which is not a plugin folder of the app'])
  })

  it('says so when there is no lock, or it cannot be read', () => {
    const root = snapshot()
    writeFileSync(join(root, 'blend.lock.json'), 'not json')
    expect(verifySnapshot(root).problems).toEqual(['blend.lock.json is not valid JSON'])
    rmSync(join(root, 'blend.lock.json'))
    expect(verifySnapshot(root)).toMatchObject({ ok: false, checked: 0 })
  })
})

describe('snapshotProblems', () => {
  it('needs no disk, and asks for a digest only of a folder the lock may name', () => {
    const asked: string[] = []
    const lock = { formatVersion: 3, origin: { digest: manifestDigest(MANIFEST) }, modules: [{ name: 'a', origin: 'local', source: 'plugins/a', digest: 'sha256:abc' }, { name: 'b', origin: 'local', source: '/etc', digest: 'sha256:abc' }] }
    const result = snapshotProblems(MANIFEST, lock, (source) => {
      asked.push(source)
      return 'abc'
    })
    expect(asked).toEqual(['plugins/a'])
    expect(result.problems).toHaveLength(1)
  })

  it('refuses another lock format', () => {
    expect(snapshotProblems(MANIFEST, { formatVersion: 2, origin: { digest: manifestDigest(MANIFEST) } }, () => undefined).problems).toEqual(['blend.lock.json formatVersion 2 is not 3'])
  })
})
