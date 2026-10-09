// Run with: deno test -A --no-check --no-config --no-lock runtime/acryl-harness-runtime/deno-tests
// The resolver exists for a Deno host (a Node host resolves plugin packages through PluginPackages), but it uses only public `module.registerHooks`, so it also runs on Node.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installDenoProfileResolver } from '../src/deno-profile-resolution.ts'

function profileWith(root: string, name: string, body: string): void {
  const dir = join(root, 'node_modules', name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0', type: 'module', exports: { '.': './index.js', './package.json': './package.json' } }))
  writeFileSync(join(dir, 'index.js'), body)
}

Deno.test('a package that exists only in the profile is imported by its bare name, including one installed after the hook', async () => {
  const root = mkdtempSync(join(tmpdir(), 'acryl-deno-resolve-'))
  const release = installDenoProfileResolver(root)
  try {
    writeFileSync(join(root, 'package.json'), '{"name":"profile","version":"1.0.0"}')
    profileWith(root, 'acryl-resolve-early', 'export const value = "early"')
    const early = await import('acryl-resolve-early') as { value: string }
    if (early.value !== 'early') throw new Error('an installed package was not resolved from the profile')
    profileWith(root, 'acryl-resolve-late', 'export const value = "late"')
    const late = await import('acryl-resolve-late') as { value: string }
    if (late.value !== 'late') throw new Error('a package installed after startup was not resolved from the profile')
  } finally {
    release()
    rmSync(root, { recursive: true, force: true })
  }
})

Deno.test('ordinary resolution is untouched: builtins, relative paths and a missing package still behave as before', async () => {
  const root = mkdtempSync(join(tmpdir(), 'acryl-deno-resolve-'))
  const release = installDenoProfileResolver(root)
  try {
    writeFileSync(join(root, 'package.json'), '{"name":"profile","version":"1.0.0"}')
    writeFileSync(join(root, 'sibling.mjs'), 'export const value = "sibling"')
    const fs = await import('node:fs')
    if (typeof fs.readFileSync !== 'function') throw new Error('a builtin was not resolved')
    const sibling = await import(`file://${join(root, 'sibling.mjs').replace(/\\/g, '/')}`) as { value: string }
    if (sibling.value !== 'sibling') throw new Error('a path import was not resolved')
    let failed = false
    try { await import('acryl-resolve-no-such-package') } catch { failed = true }
    if (!failed) throw new Error('a package nobody has was reported as found')
  } finally {
    release()
    rmSync(root, { recursive: true, force: true })
  }
})

Deno.test('the disposer is idempotent and a package stops resolving through the profile once it is released', async () => {
  const root = mkdtempSync(join(tmpdir(), 'acryl-deno-resolve-'))
  const release = installDenoProfileResolver(root)
  release()
  release()
  try {
    writeFileSync(join(root, 'package.json'), '{"name":"profile","version":"1.0.0"}')
    profileWith(root, 'acryl-resolve-after-release', 'export const value = "x"')
    let failed = false
    try { await import('acryl-resolve-after-release') } catch { failed = true }
    if (!failed) throw new Error('the profile still answered after release')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
