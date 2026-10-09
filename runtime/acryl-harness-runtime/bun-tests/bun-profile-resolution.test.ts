// Run with Bun (not part of the Node vitest suite): `bun test bun-tests` from this package folder. Covers the Bun profile resolver and the node:module compat layer (specs/042, Bun experiment).
import { afterAll, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { exposeProfilePackage, installBunProfileResolver } from '../src/bun-profile-resolution.ts'
import { findPackageJSON } from '../src/node-module-compat.ts'

const root = realpathSync(mkdtempSync(join(tmpdir(), 'acryl-bun-resolver-')))
afterAll(() => rmSync(root, { recursive: true, force: true }))

function writePackage(profile: string, name: string, body: string): void {
  const dir = join(profile, 'node_modules', name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0', type: 'module', exports: { '.': { import: './index.js' } } }))
  writeFileSync(join(dir, 'index.js'), body)
}

test('a package installed after the resolver started is importable by its bare name, and a re-install serves the new code', async () => {
  const profile = join(root, 'profile')
  mkdirSync(profile, { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({ name: 'profile', dependencies: {} }))
  const release = installBunProfileResolver(profile)
  try {
    writePackage(profile, 'acryl-bun-late', 'export const text = "one"')
    exposeProfilePackage('acryl-bun-late')
    expect(((await import('acryl-bun-late')) as { text: string }).text).toBe('one')
    // the installer stages changed code at a new path (a module is cached by path, here and on Node); the manifest then points at the new entry
    const dir = join(profile, 'node_modules', 'acryl-bun-late')
    writeFileSync(join(dir, 'index-v2.js'), 'export const text = "two"')
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'acryl-bun-late', version: '1.0.1', type: 'module', exports: { '.': { import: './index-v2.js' } } }))
    exposeProfilePackage('acryl-bun-late')
    expect(((await import('acryl-bun-late')) as { text: string }).text).toBe('two')
  } finally {
    release()
  }
})

test('exposing a name the profile does not have changes nothing, and the disposer is idempotent', () => {
  const profile = join(root, 'empty')
  mkdirSync(profile, { recursive: true })
  const release = installBunProfileResolver(profile)
  expect(() => exposeProfilePackage('not-a-profile-package')).not.toThrow()
  release()
  release()
  expect(() => exposeProfilePackage('not-a-profile-package')).not.toThrow()
})

test('findPackageJSON answers for a file and for a bare package name', () => {
  const profile = join(root, 'compat')
  writePackage(profile, 'compat-pkg', 'export {}')
  const manifest = findPackageJSON('compat-pkg', join(profile, 'x.js'))
  expect(manifest).toBe(join(profile, 'node_modules', 'compat-pkg', 'package.json'))
  expect(findPackageJSON(join(profile, 'node_modules', 'compat-pkg', 'index.js'))).toBe(manifest)
  expect(findPackageJSON('nothing-called-this', join(profile, 'x.js'))).toBeUndefined()
})
