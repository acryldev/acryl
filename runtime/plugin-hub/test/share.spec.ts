import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { gitCli, integrityOf, PluginStore, pullPlugin, parsePluginSource, sharePlugin, slotsInSource, type RepositoryHostPort, type Visibility } from '../src/index.js'

let root: string
const savedEnv: Record<string, string | undefined> = {}
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'plugin-hub-share-')))
  for (const key of ['GIT_AUTHOR_NAME', 'GIT_COMMITTER_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_EMAIL', 'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM']) savedEnv[key] = process.env[key]
  process.env['GIT_AUTHOR_NAME'] = process.env['GIT_COMMITTER_NAME'] = 'test'
  process.env['GIT_AUTHOR_EMAIL'] = process.env['GIT_COMMITTER_EMAIL'] = 'test@example.com'
  process.env['GIT_CONFIG_GLOBAL'] = join(root, 'gitconfig')
  process.env['GIT_CONFIG_NOSYSTEM'] = '1'
  writeFileSync(join(root, 'gitconfig'), '[init]\n\tdefaultBranch = main\n')
})
afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
  rmSync(root, { recursive: true, force: true })
})

/** GitHub as the share sees it, backed by bare repositories on disk; releases keep their asset bytes. */
function fakeGithub(login = 'inboxxobni'): RepositoryHostPort & { repos: Map<string, { visibility: Visibility; topics: Set<string> }>; releases: Map<string, Buffer> } {
  const repos = new Map<string, { visibility: Visibility; topics: Set<string> }>()
  const releases = new Map<string, Buffer>()
  const bare = (owner: string, repo: string) => join(root, 'remotes', owner, `${repo}.git`)
  return {
    repos, releases,
    login: () => login,
    repository: (owner, repo) => { const found = repos.get(`${owner}/${repo}`); return found === undefined ? undefined : { visibility: found.visibility, url: `https://github.com/${owner}/${repo}` } },
    createRepository(owner, repo, visibility) {
      mkdirSync(bare(owner, repo), { recursive: true })
      execFileSync('git', ['init', '--bare', '--quiet', bare(owner, repo)])
      repos.set(`${owner}/${repo}`, { visibility, topics: new Set() })
    },
    setVisibility(owner, repo, visibility) { repos.get(`${owner}/${repo}`)!.visibility = visibility },
    addTopics(owner, repo, topics) { for (const topic of topics) repos.get(`${owner}/${repo}`)!.topics.add(topic) },
    releaseExists: (owner, repo, tag) => releases.has(`${owner}/${repo}@${tag}`),
    createRelease(owner, repo, tag, _title, _notes, assetPath) {
      execFileSync('git', ['--git-dir', bare(owner, repo), 'rev-parse', '--verify', `refs/tags/${tag}`])
      releases.set(`${owner}/${repo}@${tag}`, readFileSync(assetPath))
      return `https://github.com/${owner}/${repo}/releases/tag/${tag}`
    },
    cloneUrl: (owner, repo) => bare(owner, repo),
  }
}

function plugin(version = '0.2.1', extra: Record<string, unknown> = {}): string {
  const dir = join(root, 'src', 'quick-notes')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: 'acryl-quick-notes', version, type: 'module', license: 'MIT', main: './index.js', dsh: { bundle: { patch: './cordis.patch.yml' } }, ...extra }, null, 2)}\n`)
  writeFileSync(join(dir, 'index.js'), "export const name = 'acryl-quick-notes'\nexport const inject = ['connection', 'dshHomePath']\nexport function apply() {}\n")
  writeFileSync(join(dir, 'cordis.patch.yml'), '- insert:\n    - id: acryl-quick-notes\n      name: acryl-quick-notes\n')
  return dir
}

const repoFiles = (github: ReturnType<typeof fakeGithub>, owner: string, repo: string, ref: string) =>
  execFileSync('git', ['--git-dir', join(root, 'remotes', owner, `${repo}.git`), 'ls-tree', '-r', '--name-only', ref], { encoding: 'utf8' }).trim().split('\n').sort()

describe('share', () => {
  it('first share creates a private repository with exactly the packed files, tag, release and labels, and keeps the version', async () => {
    const github = fakeGithub()
    const store = new PluginStore(join(root, 'store'))
    const dir = plugin()
    const result = await sharePlugin(dir, {}, { host: github, git: gitCli(), store })
    expect(result.status).toBe('shared')
    if (result.status !== 'shared') return
    expect([result.owner, result.repo, result.visibility, result.created, result.tag]).toEqual(['inboxxobni', 'acryl-quick-notes', 'private', true, 'v0.2.1'])
    expect(result.updatedManifest).toEqual(['service contract and slots', 'keywords +acryl-package, +cordis-plugin, +dsh-plugin', 'repository'])
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    expect(manifest.acryl.requires).toEqual({ host: ['connection', 'dshHomePath'] })
    expect(manifest.repository.url).toBe('git+https://github.com/inboxxobni/acryl-quick-notes.git')
    expect(repoFiles(github, 'inboxxobni', 'acryl-quick-notes', 'v0.2.1')).toEqual([...result.files].sort())
    expect([...github.repos.get('inboxxobni/acryl-quick-notes')!.topics].sort()).toEqual(['acryl-package', 'cordis-plugin', 'dsh-plugin'])
    const asset = github.releases.get('inboxxobni/acryl-quick-notes@v0.2.1')!
    expect(integrityOf(asset)).toBe(result.integrity)
    expect(store.get('acryl-quick-notes', '0.2.1')?.integrity).toBe(result.integrity)

    // What was shared is what a pull of that release gets: same bytes, same sha512.
    const other = new PluginStore(join(root, 'other-store'))
    const pulled = await pullPlugin(parsePluginSource('github:inboxxobni/acryl-quick-notes@0.2.1'), {
      store: other,
      releases: { release: async (_o, _r, tag) => ({ tag: tag ?? 'v0.2.1', assets: [{ name: 'a.tgz', url: 'x' }] }), download: async () => asset },
    }, { expectIntegrity: result.integrity })
    expect(pulled.stored.integrity).toBe(result.integrity)
  })

  it('a version is released once; a fix with a new version shares on top, history kept', async () => {
    const github = fakeGithub()
    const store = new PluginStore(join(root, 'store'))
    const dir = plugin()
    await sharePlugin(dir, {}, { host: github, git: gitCli(), store })
    writeFileSync(join(dir, 'index.js'), "export const name = 'acryl-quick-notes'\nexport const inject = ['connection', 'dshHomePath']\nexport function apply() { /* fix */ }\n")
    const again = await sharePlugin(dir, {}, { host: github, git: gitCli(), store })
    expect(again).toMatchObject({ status: 'refused', reason: expect.stringMatching(/already has release v0\.2\.1; a version is released once/u) })
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ ...manifest, version: '0.2.2' }, null, 2)}\n`)
    const fixed = await sharePlugin(dir, {}, { host: github, git: gitCli(), store })
    expect(fixed).toMatchObject({ status: 'shared', tag: 'v0.2.2', created: false })
    const log = execFileSync('git', ['--git-dir', join(root, 'remotes', 'inboxxobni', 'acryl-quick-notes.git'), 'log', '--format=%s', 'main'], { encoding: 'utf8' }).trim().split('\n')
    expect(log).toEqual(['acryl-quick-notes 0.2.2', 'acryl-quick-notes 0.2.1'])
    expect(store.list().map(entry => entry.version)).toEqual(['0.2.2', '0.2.1'])
  })

  it('refuses a secret in the packed files, and sends nothing', async () => {
    const github = fakeGithub()
    const dir = plugin()
    writeFileSync(join(dir, 'config.js'), 'export const key = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789"\n')
    const result = await sharePlugin(dir, {}, { host: github, git: gitCli(), store: new PluginStore(join(root, 'store')) })
    expect(result.status).toBe('refused')
    if (result.status !== 'refused') return
    expect(result.reason).toMatch(/secret check found 1 possible secret/u)
    expect(result.secrets?.[0]?.path).toBe('config.js')
    expect(github.repos.size).toBe(0)
  })

  it('a private plugin is never sent to a public repository; listing publicly needs a license and flips a private one', async () => {
    const github = fakeGithub()
    const store = new PluginStore(join(root, 'store'))
    github.createRepository('inboxxobni', 'acryl-quick-notes', 'public', '')
    expect(await sharePlugin(plugin(), {}, { host: github, git: gitCli(), store })).toMatchObject({ status: 'refused', reason: expect.stringMatching(/never sent to a public repository/u) })

    const second = fakeGithub()
    const dir = plugin('0.3.0', { license: undefined })
    expect(await sharePlugin(dir, { visibility: 'public' }, { host: second, git: gitCli(), store })).toMatchObject({ status: 'refused', reason: expect.stringMatching(/needs a "license"/u) })
    plugin('0.3.0')
    await sharePlugin(dir, {}, { host: second, git: gitCli(), store })
    expect(second.repos.get('inboxxobni/acryl-quick-notes')?.visibility).toBe('private')
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ ...manifest, version: '0.3.1' }, null, 2)}\n`)
    expect(await sharePlugin(dir, { visibility: 'public' }, { host: second, git: gitCli(), store })).toMatchObject({ status: 'shared', visibility: 'public' })
    expect(second.repos.get('inboxxobni/acryl-quick-notes')?.visibility).toBe('public')
  })
})

describe('slots', () => {
  it('reads the slots a source declares and fills, in their literal form only', () => {
    const source = `
      ctx.slots.register({ name: 'sidebar.right.pane.tab', id: 'x', children: { 'notes.panel.actions': { kind: 'list', scope: 'session' } } }, A)
      ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({ name: 'conversation.session.header.actions', id: 'y' }, B))
      ctx.slots.register({ name: slotName }, C)
    `
    expect(slotsInSource(source)).toEqual({ offers: ['notes.panel.actions'], fills: ['sidebar.right.pane.tab', 'conversation.session.header.actions'] })
  })
})
