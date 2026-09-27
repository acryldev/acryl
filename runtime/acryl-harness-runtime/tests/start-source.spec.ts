/** Where a new app starts from (spec 036): a folder, a git repository (via a real local git server), or a starter id in a registry. */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildRegistryIndex } from '@webboxes/blends-core'
import { StartSourceError, classifyStartSource, resolveStartSource } from '../src/app/start-source.ts'

const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { force: true, recursive: true }) })
const temp = (): string => { const dir = realpathSync(mkdtempSync(join(tmpdir(), 'acryl-start-'))); dirs.push(dir); return dir }
const git = (cwd: string, ...args: string[]) => { const r = spawnSync('git', args, { cwd, encoding: 'utf8' }); if (r.status !== 0) throw new Error(r.stderr) }

const starter = (id: string) => `apiVersion: blends.acryl.dev/v1alpha1\nkind: Blend\nmetadata:\n  id: ${id}\n  name: Accounting\n  version: 0.1.0\n  license: MIT\n  visibility: public\nspec:\n  runtime: cordis\n  lineage:\n    blueprint: acryl.blank\n    blueprintVersion: 0.1.0\n`

/** A git repository on disk, reached by a file:// URL: the same transport as a remote one, without a network. */
function repository(root: string, files: Record<string, string>): string {
  const dir = join(root, 'origin'); mkdirSync(dir, { recursive: true })
  for (const [path, text] of Object.entries(files)) { mkdirSync(join(dir, path, '..'), { recursive: true }); writeFileSync(join(dir, path), text) }
  git(dir, 'init', '--quiet'); git(dir, 'add', '.'); git(dir, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'x')
  return `file://${dir}`
}

describe('classifyStartSource', () => {
  it('tells folders, git URLs and starter ids apart', () => {
    expect(classifyStartSource('/x', path => path === '/x')).toEqual({ kind: 'folder', path: '/x' })
    expect(classifyStartSource('git@github.com:agency/accounting.git', () => false)).toEqual({ kind: 'git', url: 'git@github.com:agency/accounting.git' })
    expect(classifyStartSource('https://github.com/acrylblends/acrylblends.github.io.git#registry/blends/x', () => false)).toMatchObject({ kind: 'git', subdir: 'registry/blends/x' })
    expect(classifyStartSource('acme.accounting', () => false)).toEqual({ kind: 'registry', id: 'acme.accounting' })
    expect(() => classifyStartSource('just words', () => false)).toThrow(StartSourceError)
    expect(() => classifyStartSource('https://h/r.git#../etc', () => false)).toThrow(/not a folder inside/)
  })
})

describe('resolveStartSource', () => {
  it('clones a git repository (private ones use the user\'s own git login) and cleans up after', () => {
    const url = repository(temp(), { 'blend.yaml': starter('agency.accounting'), 'extensions/ledger/package.json': '{}' })
    const resolved = resolveStartSource(url)
    expect(existsSync(join(resolved.folder, 'extensions', 'ledger', 'package.json'))).toBe(true)
    resolved.dispose()
    expect(existsSync(resolved.folder)).toBe(false)
  })

  it('finds a starter by id in a registry, from a git repository or a folder', () => {
    const root = temp()
    const { index } = buildRegistryIndex([{ path: 'blends/acme.accounting', manifestText: starter('acme.accounting') }])
    const url = repository(root, { 'registry/index.json': JSON.stringify(index), 'registry/blends/acme.accounting/blend.yaml': starter('acme.accounting') })
    const fromGit = resolveStartSource('acme.accounting', { registry: `${url}#registry` })
    expect(fromGit.folder.endsWith(join('registry', 'blends', 'acme.accounting'))).toBe(true)
    expect(fromGit.origin).toContain('acme.accounting')
    fromGit.dispose()
    const fromFolder = resolveStartSource('acme.accounting', { registry: `${join(root, 'origin')}#registry` })
    expect(existsSync(join(fromFolder.folder, 'blend.yaml'))).toBe(true)
    expect(() => resolveStartSource('acme.missing', { registry: `${join(root, 'origin')}#registry` })).toThrow(/no starter "acme.missing"/)
  })

  it('says what is wrong: not a repository, no credentials, not an app', () => {
    const root = temp()
    expect(() => resolveStartSource('file:///nowhere/at/all.git')).toThrow(/could not clone.*own git login/su)
    mkdirSync(join(root, 'empty'))
    expect(() => resolveStartSource(join(root, 'empty'))).toThrow(/has no blend.yaml/)
    expect(() => resolveStartSource('acme.x', { registry: join(root, 'empty') })).toThrow(/not a registry/)
  })
})
