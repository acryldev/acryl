import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { detectManager, parseScripts, readWorktreeChecks } from '../src/workspace-checks.ts'
import { checkCommandLine, parseGitChecksView } from '../src/workspace-git-contract.ts'
import { WorkspaceGit, WorkspaceGitError } from '../src/workspace-git.ts'

let root = ''
const dirs = { pnpm: '', bare: '', broken: '', huge: '' }

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'acryl-checks-'))
  for (const name of Object.keys(dirs) as (keyof typeof dirs)[]) {
    dirs[name] = join(root, name)
    await import('node:fs/promises').then(fs => fs.mkdir(dirs[name]))
  }
  await writeFile(join(dirs.pnpm, 'package.json'), JSON.stringify({ scripts: { dev: 'vite', check: 'vitest run', 'test:unit': 'vitest run unit', 'evil; rm -rf /': 'x', '$(id)': 'y' } }))
  await writeFile(join(dirs.pnpm, 'pnpm-lock.yaml'), '')
  await writeFile(join(dirs.broken, 'package.json'), '{ not json')
  await writeFile(join(dirs.huge, 'package.json'), JSON.stringify({ scripts: { a: 'x'.repeat(300 * 1024) } }))
})

afterAll(async () => { await rm(root, { recursive: true, force: true }) })

describe('parseScripts', () => {
  it('keeps only plain script names, marks check-like ones and lists them first', () => {
    const scripts = parseScripts(JSON.stringify({ scripts: { dev: 'vite', build: 'tsc', 'test:unit': 'vitest', 'a b': 'x', 'x;y': 'x', n: 5 } }))
    expect(scripts.map(s => s.name)).toEqual(['build', 'test:unit', 'dev'])
    expect(scripts.map(s => s.primary)).toEqual([true, true, false])
  })

  it('returns nothing for malformed or unexpected shapes', () => {
    expect(parseScripts('nope')).toEqual([])
    expect(parseScripts('[]')).toEqual([])
    expect(parseScripts('{"scripts":[]}')).toEqual([])
    expect(parseScripts('{}')).toEqual([])
  })
})

describe('readWorktreeChecks', () => {
  it('reads scripts and the manager named by the lockfile', async () => {
    const view = await readWorktreeChecks(dirs.pnpm)
    expect(view.manager).toBe('pnpm')
    expect(view.scripts.map(s => s.name)).toEqual(['check', 'test:unit', 'dev'])
    expect(await detectManager(dirs.bare)).toBeNull()
  })

  it('treats a missing, broken or oversized package.json as no scripts', async () => {
    expect((await readWorktreeChecks(dirs.bare)).scripts).toEqual([])
    expect((await readWorktreeChecks(dirs.broken)).scripts).toEqual([])
    expect((await readWorktreeChecks(dirs.huge)).scripts).toEqual([])
  })

  it('goes through the git service, which rejects a relative or missing directory', async () => {
    const git = new WorkspaceGit()
    expect((await git.checks(dirs.pnpm)).manager).toBe('pnpm')
    await expect(git.checks('relative')).rejects.toBeInstanceOf(WorkspaceGitError)
    await expect(git.checks(join(root, 'missing'))).rejects.toBeInstanceOf(WorkspaceGitError)
    await git.dispose()
  })
})

describe('checks contract', () => {
  it('parses a valid view and rejects unsafe names and unknown managers', () => {
    const ok = { path: '/p', manager: 'pnpm', scripts: [{ name: 'check', command: 'x', primary: true }] }
    expect(parseGitChecksView(ok)).toEqual(ok)
    expect(parseGitChecksView({ ...ok, manager: null }).manager).toBeNull()
    expect(() => parseGitChecksView({ ...ok, manager: 'make' })).toThrow(/invalid/)
    expect(() => parseGitChecksView({ ...ok, scripts: [{ name: 'a;b', command: 'x', primary: false }] })).toThrow(/invalid/)
  })

  it('builds the command line from a safe name and the project manager, defaulting to npm', () => {
    expect(checkCommandLine('pnpm', 'test:unit')).toBe('pnpm run test:unit')
    expect(checkCommandLine(null, 'check')).toBe('npm run check')
    expect(() => checkCommandLine('npm', 'x; rm -rf /')).toThrow(/unsafe/)
  })
})
