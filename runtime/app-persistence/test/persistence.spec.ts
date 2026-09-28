import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { connectRemote, findSecrets, gitCli, readAppIdentity, saveApp, type HostingPort } from '../src/index.js'

const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })
const temp = (): string => { const dir = realpathSync(mkdtempSync(join(tmpdir(), 'app-persist-'))); dirs.push(dir); return dir }
const git = (cwd: string, ...args: string[]) => spawnSync('git', args, { cwd, encoding: 'utf8' })

const manifest = (visibility?: string) => `apiVersion: blends.acryl.dev/v1alpha1\nkind: Blend\nmetadata:\n  id: app.books\n  name: Books\n  version: 0.1.0\n${visibility === undefined ? '' : `  visibility: ${visibility}\n`}spec:\n  runtime: cordis\n  lineage:\n    blueprint: acryl.blank\n    blueprintVersion: 0.1.0\n`

/** A hosting fake: remotes are local bare repositories; visibility is what the test says. */
function hosting(root: string, visibility: Record<string, 'public' | 'private'> = {}): HostingPort & { created: string[] } {
  const created: string[] = []
  return {
    created,
    visibilityOf: url => visibility[url] ?? 'unknown',
    create: (name, chosen) => {
      const bare = join(root, `${name}.git`)
      git(root, 'init', '--bare', '--quiet', bare)
      created.push(`${name}:${chosen}`)
      visibility[bare] = chosen
      return bare
    },
  }
}

function app(root: string, text = manifest()): string {
  const dir = join(root, 'books'); mkdirSync(join(dir, 'extensions', 'ledger'), { recursive: true })
  writeFileSync(join(dir, 'blend.yaml'), text)
  writeFileSync(join(dir, '.gitignore'), '.dsh/\n')
  writeFileSync(join(dir, 'extensions', 'ledger', 'index.js'), 'export function apply() {}\n')
  mkdirSync(join(dir, '.dsh')); writeFileSync(join(dir, '.dsh', 'settings.yaml'), 'apiKey: "sk-ant-api03-thisIsARealLookingKeyValue1234567890"\n')
  git(dir, 'init', '--quiet'); git(dir, 'config', 'user.name', 't'); git(dir, 'config', 'user.email', 't@t')
  return dir
}

describe('identity', () => {
  it('an app is private unless it says public', () => {
    expect(readAppIdentity(manifest()).visibility).toBe('private')
    expect(readAppIdentity(manifest('publik')).visibility).toBe('private')
    expect(readAppIdentity(manifest('public')).visibility).toBe('public')
  })
})

describe('the secret check', () => {
  it('finds credentials and secret files, and leaves ordinary code alone', () => {
    const found = findSecrets([
      { path: 'a.js', text: 'const key = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz"\n' },
      { path: 'b.js', text: 'const t = "ghp_' + 'a'.repeat(36) + '"\n' },
      { path: 'c.yaml', text: 'password: "correct-horse-battery-staple"\n' },
      { path: 'config/.env', text: 'X=1' },
      { path: 'deploy/server.pem', text: '' },
      { path: '.env.example', text: 'API_KEY=' },
      { path: 'ok.js', text: 'const tokenCount = 42\nexport const secret = process.env.SECRET\n' },
    ])
    expect(found.map(finding => `${finding.path}:${finding.kind}`)).toEqual(['a.js:Anthropic API key', 'b.js:GitHub token', 'c.yaml:assigned secret', 'config/.env:a secrets file', 'deploy/server.pem:a secrets file'])
  })
})

describe('saving', () => {
  it('commits the app (not its runtime data) and pushes to a connected private remote', () => {
    const root = temp(); const dir = app(root); const host = hosting(root)
    expect(connectRemote({ manifestText: manifest(), name: 'books' }, gitCli(dir), host)).toMatchObject({ status: 'connected', visibility: 'private', created: true })
    expect(host.created).toEqual(['books:private'])
    const saved = saveApp({ manifestText: manifest(), message: 'first version' }, gitCli(dir), host)
    expect(saved).toMatchObject({ status: 'saved', pushed: true })
    const files = git(dir, 'ls-files').stdout.split('\n').filter(Boolean)
    expect(files).toEqual(['.gitignore', 'blend.yaml', 'extensions/ledger/index.js'])   // .dsh (with its key) stays out
    expect(git(join(root, 'books.git'), 'log', '--oneline').stdout).toContain('first version')
    expect(saveApp({ manifestText: manifest(), message: 'again' }, gitCli(dir), host)).toEqual({ status: 'nothing-to-save' })
  })

  it('pushes an already-committed app that connected a remote after its first commit, even with nothing new to save', () => {
    // The real sequence: `acryl new` commits, then `acryl remote connect` only adds the remote (see connect.ts) -
    // the first `acryl save` afterwards has no working-tree changes to stage, but the remote has never seen the
    // app at all. A prior version reported `nothing-to-save` here and left the new repository empty.
    const root = temp(); const dir = app(root)
    git(dir, 'add', '--all', '.'); git(dir, 'commit', '--quiet', '-m', 'first commit, before any remote exists')
    const host = hosting(root)
    expect(connectRemote({ manifestText: manifest(), name: 'books' }, gitCli(dir), host)).toMatchObject({ status: 'connected', created: true })
    const saved = saveApp({ manifestText: manifest(), message: 'unused: nothing is staged' }, gitCli(dir), host)
    expect(saved).toMatchObject({ status: 'saved', pushed: true })
    expect(git(join(root, 'books.git'), 'log', '--oneline').stdout).toContain('first commit, before any remote exists')
    // Now genuinely nothing to do: already pushed, nothing staged.
    expect(saveApp({ manifestText: manifest(), message: 'x' }, gitCli(dir), host)).toEqual({ status: 'nothing-to-save' })
  })

  it('refuses a secret in the app\'s own files and leaves nothing staged', () => {
    const root = temp(); const dir = app(root)
    writeFileSync(join(dir, 'extensions', 'ledger', 'index.js'), 'const key = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz"\n')
    const result = saveApp({ manifestText: manifest(), message: 'x' }, gitCli(dir), hosting(root))
    expect(result).toMatchObject({ status: 'refused', secrets: [expect.objectContaining({ path: 'extensions/ledger/index.js', line: 1 })] })
    expect(git(dir, 'diff', '--cached', '--name-only').stdout).toBe('')
    expect(git(dir, 'log').status).not.toBe(0)   // no commit was made
  })

  it('never lets a private app reach a public remote, and connects a public one only for a public app', () => {
    const root = temp(); const dir = app(root)
    const publicRemote = join(root, 'open.git'); git(root, 'init', '--bare', '--quiet', publicRemote)
    const host = hosting(root, { [publicRemote]: 'public' })
    expect(connectRemote({ manifestText: manifest(), name: 'x', url: publicRemote }, gitCli(dir), host)).toMatchObject({ status: 'refused' })
    expect(connectRemote({ manifestText: manifest(), name: 'x', visibility: 'public' }, gitCli(dir), host)).toMatchObject({ status: 'refused' })
    git(dir, 'remote', 'add', 'origin', publicRemote)   // added by hand, outside ACRYL
    expect(saveApp({ manifestText: manifest(), message: 'x' }, gitCli(dir), host)).toMatchObject({ status: 'refused', reason: expect.stringContaining('is public') })
    expect(saveApp({ manifestText: manifest('public'), message: 'open it' }, gitCli(dir), host)).toMatchObject({ status: 'saved', pushed: true })
    expect(readFileSync(join(dir, 'blend.yaml'), 'utf8')).toContain('app.books')
  })
})
