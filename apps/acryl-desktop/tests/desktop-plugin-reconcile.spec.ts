import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { profileDependencyNames, reconcileProfileBundles } from '../src/desktop-plugin-reconcile.ts'

let root: string
let profileDir: string

/** Write the profile manifest. */
function writeManifest(manifest: Record<string, unknown>): void {
  writeFileSync(join(profileDir, 'package.json'), `${JSON.stringify(manifest, undefined, 2)}\n`)
}

/** Materialize a profile-local package with an optional dsh.bundle declaration. */
function installPackage(name: string, declaresBundle: boolean): void {
  const dir = join(profileDir, 'node_modules', name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name,
    version: '1.0.0',
    ...(declaresBundle ? { dsh: { bundle: { patch: './cordis.patch.yml' } } } : {}),
  }))
  if (declaresBundle) writeFileSync(join(dir, 'cordis.patch.yml'), '[]\n')
}

function bundles(): readonly string[] {
  const manifest = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8')) as {
    dsh?: { profile?: { bundles?: string[] } }
  }
  return manifest.dsh?.profile?.bundles ?? []
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'acryl-reconcile-'))
  profileDir = join(root, 'profiles', 'desktop')
  mkdirSync(profileDir, { recursive: true })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('reconcileProfileBundles', () => {
  it('appends a newly installed dependency that declares a bundle patch', () => {
    writeManifest({
      dependencies: { 'acryl-editor': '0.2.3' },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
    })
    installPackage('acryl-editor', true)

    const result = reconcileProfileBundles(profileDir, [])

    expect(result).toMatchObject({ changed: true, added: ['acryl-editor'], removed: [] })
    expect(bundles()).toEqual([
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-web-app',
      'acryl-editor',
    ])
  })

  it('leaves a bundle-less dependency out of the layer list and reports it', () => {
    writeManifest({ dependencies: { 'plain-lib': '1.0.0' }, dsh: { profile: { bundles: [] } } })
    installPackage('plain-lib', false)

    const result = reconcileProfileBundles(profileDir, [])

    expect(result).toMatchObject({ changed: false, plainDependencies: ['plain-lib'] })
    expect(bundles()).toEqual([])
  })

  it('drops a former dependency from the layer list when it is uninstalled', () => {
    writeManifest({
      dependencies: {},
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'acryl-editor'] } },
    })

    const result = reconcileProfileBundles(profileDir, ['acryl-editor'])

    expect(result).toMatchObject({ changed: true, added: [], removed: ['acryl-editor'] })
    expect(bundles()).toEqual(['@deepseek-ai/dsh-base'])
  })

  it('never touches an in-box template bundle that was never a dependency', () => {
    writeManifest({
      dependencies: { 'acryl-editor': '0.2.3' },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
    })
    installPackage('acryl-editor', true)

    reconcileProfileBundles(profileDir, [])

    expect(bundles()).toContain('@deepseek-ai/dsh-base')
    expect(bundles()).toContain('@deepseek-ai/dsh-web-app')
  })

  it('is idempotent - a second pass makes no further change', () => {
    writeManifest({ dependencies: { 'acryl-editor': '0.2.3' }, dsh: { profile: { bundles: [] } } })
    installPackage('acryl-editor', true)

    reconcileProfileBundles(profileDir, [])
    const second = reconcileProfileBundles(profileDir, ['acryl-editor'])

    expect(second.changed).toBe(false)
    expect(bundles()).toEqual(['acryl-editor'])
  })

  it('reads the current dependency names', () => {
    writeManifest({ dependencies: { a: '1.0.0', b: '2.0.0' } })
    expect([...profileDependencyNames(profileDir)].sort()).toEqual(['a', 'b'])
  })
})
