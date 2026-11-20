import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { planAppPluginShare, shareAppPlugin, type SharePorts } from '../src/app-plugins.ts'
import { parseGithubReadiness, parsePulledPlugin, parseRegistryView, parseSharePlan, type RegistryEntryView, type SharePlan } from '../src/contract.ts'
import { frameRoutes } from '../src/index.ts'
import { githubReadiness, plainPullRefusal, plainShareProblem, PlainError } from '../src/plain.ts'
import { bareName, createRegistryReader, downloadFor, readRegistryView, registryEntries, repoOfSource, type RegistryMarks } from '../src/registry.ts'
import { createRegistryApi } from '../src/client/registry-api.ts'
import { addedText, addQuestion, cleanAddress, entryByline, filterRegistry } from '../src/client/registry-list.ts'
import { colleagueAddress, shareButton, shareDetails, shareQuestion, shareSentence } from '../src/client/plugins-navigator.ts'
import { PlainFailure } from '../src/client/plain-failure.ts'

const NONE: RegistryMarks = { names: new Set(), repos: new Set(), accounts: new Set() }

const index = (entries: unknown[]) => ({ formatVersion: 1, entries })
const listed = (name: string, owner: string, extra: Record<string, unknown> = {}) => ({
  name,
  description: `The ${name} plugin`,
  repo: `https://github.com/${owner}/${name}`,
  version: '1.0.0',
  published: '2026-11-01',
  compatibility: 'ACRYL',
  acrylPull: `github:${owner}/${name}@1.0.0`,
  ...extra,
})

describe('the registry as the frame reads it', () => {
  it('keeps what an app can pull, marks what is added and what is the person\'s own, and sorts own first then newest', () => {
    const entries = registryEntries(index([
      listed('dice', 'inboxxobni', { published: '2026-10-01' }),
      listed('clock', 'someone', { published: '2026-11-05' }),
      listed('notes', 'someone', { published: '2026-11-01' }),
      { ...listed('bare', 'someone'), acrylPull: undefined },
      { ...listed('blend-made', 'someone', { published: '2026-10-20' }), acrylPull: undefined, install: 'npm run acryl -- plugin pull github:someone/blend-made@1.0.0' },
      { ...listed('noversion', 'someone'), version: undefined },
      'junk',
    ]), { names: new Set(['clock']), repos: new Set(['someone/notes']), accounts: new Set(['inboxxobni']) })
    expect(entries.map(entry => [entry.name, entry.installed, entry.mine])).toEqual([
      ['dice', false, true],
      ['clock', true, false],
      ['notes', true, false],
      ['blend-made', false, false],
    ])
    expect(entries[0]).toMatchObject({ owner: 'inboxxobni', url: 'https://github.com/inboxxobni/dice', source: 'github:inboxxobni/dice@1.0.0', published: '2026-10-01' })
    expect(() => registryEntries({ formatVersion: 2, entries: [] }, NONE)).toThrow('version 1')
    expect(bareName('@owner/Notes')).toBe('notes')
    expect(repoOfSource('github:Owner/Repo@1.0.0')).toBe('owner/repo')
    expect(repoOfSource('./local')).toBeUndefined()
  })

  it('reads once in a while, shows the earlier copy when a later read fails, and says why in plain words when there is none', async () => {
    let now = 0
    let mode: 'ok' | 'down' | 'busy' = 'ok'
    let reads = 0
    const read = createRegistryReader(async () => {
      reads += 1
      if (mode === 'down') throw new Error('ENOTFOUND')
      return mode === 'busy' ? { ok: false, status: 429, json: async () => ({}) } : { ok: true, status: 200, json: async () => index([listed('dice', 'a')]) }
    }, { ttlMs: 1000, now: () => now })
    const marks = async () => NONE
    expect(await readRegistryView(read, marks)).toMatchObject({ status: 'ready' })
    await read()
    expect(reads).toBe(1)
    now = 5000
    mode = 'down'
    const stale = await readRegistryView(read, marks)
    expect(stale.status === 'ready' && stale.entries.length).toBe(1)
    const fresh = createRegistryReader(async () => { throw new Error('ENOTFOUND') })
    const unreachable = await readRegistryView(fresh, marks)
    expect(unreachable).toEqual({ status: 'unavailable', message: expect.stringContaining('Check your internet connection') })
    mode = 'busy'
    const busy = createRegistryReader(async () => ({ ok: false, status: 429, json: async () => ({}) }))
    expect(await readRegistryView(busy, marks)).toEqual({ status: 'unavailable', message: expect.stringContaining('busy') })
    const odd = createRegistryReader(async () => ({ ok: true, status: 200, json: async () => ({ formatVersion: 9 }) }))
    expect(await readRegistryView(odd, marks)).toEqual({ status: 'unavailable', message: expect.stringContaining('does not understand') })
  })

  it('parses what the Host answers, and refuses anything else', () => {
    const view = { status: 'ready', entries: registryEntries(index([listed('dice', 'a')]), NONE), readAt: '2026-11-11T10:00:00.000Z' }
    expect(parseRegistryView(JSON.parse(JSON.stringify(view)))).toEqual(view)
    expect(parseRegistryView({ status: 'unavailable', message: 'x' })).toEqual({ status: 'unavailable', message: 'x' })
    expect(() => parseRegistryView({ status: 'ready' })).toThrow()
    expect(parsePulledPlugin({ name: 'dice', version: '1.0.0', action: 'installed', state: 'active' })).toMatchObject({ action: 'installed' })
    expect(() => parsePulledPlugin({ name: 'dice' })).toThrow()
    expect(parseGithubReadiness({ status: 'ready', account: 'a' })).toEqual({ status: 'ready', account: 'a' })
    expect(() => parseGithubReadiness({ status: 'ready' })).toThrow()
  })
})

describe('a plugin that brings a native package', () => {
  const native = [
    { os: 'darwin', cpu: 'arm64', size: 153_160_461 },
    { os: 'win32', cpu: 'x64', size: 190_868_740 },
    { os: 'linux', size: 152_357_942 },
  ]
  it('carries the size from the index for this computer', () => {
    const [entry] = registryEntries(index([{ ...listed('office-preview', 'cordisplugins'), native }]), NONE)
    expect(entry?.download).toBe(downloadFor(native))
  })
  it('names the size for this computer: its OS and CPU, then its OS for any CPU, else nothing', () => {
    expect(downloadFor(native, 'darwin', 'arm64')).toBe(153_160_461)
    expect(downloadFor(native, 'linux', 'arm64')).toBe(152_357_942)
    expect(downloadFor(native, 'darwin', 'x64')).toBeUndefined()
    expect(downloadFor(undefined)).toBeUndefined()
  })
  it('shows the size on the row, and it survives the Host answer', () => {
    const entry = { name: 'office-preview', description: '', owner: 'cordisplugins', url: 'https://github.com/cordisplugins/office-preview', version: '1.0.0', compatibility: 'ACRYL', origin: 'official' as const, source: 'github:cordisplugins/office-preview@1.0.0', installed: false, mine: false, download: 153_160_461 }
    expect(entryByline(entry)).toBe('by cordisplugins · v1.0.0 · 153 MB download')
    const view = parseRegistryView({ status: 'ready', readAt: '2026-11-18T00:00:00Z', entries: [entry] })
    expect(view.status === 'ready' ? view.entries[0]?.download : undefined).toBe(153_160_461)
  })
})

describe('official and community plugins', () => {
  const entries = registryEntries(index([
    listed('clock', 'someone', { published: '2026-11-05', origin: 'community' }),
    listed('office-preview', 'cordisplugins', { published: '2026-10-01', origin: 'official' }),
    listed('old-index', 'someone', { published: '2026-11-04' }),
    listed('claims', 'someone', { published: '2026-11-03', origin: 'Official' }),
  ]), NONE)

  it('takes the origin the registry decided, calls nothing else official, and lists official first', () => {
    expect(entries.map(entry => [entry.name, entry.origin])).toEqual([['office-preview', 'official'], ['clock', 'community'], ['old-index', 'community'], ['claims', 'community']])
    expect(filterRegistry(entries, '', false, 'official').map(entry => entry.name)).toEqual(['office-preview'])
    expect(filterRegistry(entries, '', false, 'community')).toHaveLength(3)
    expect(parseRegistryView({ status: 'ready', readAt: 'x', entries: [{ ...entries[1], origin: 'something' }] })).toMatchObject({ entries: [{ origin: 'community' }] })
  })

  it('says "community" before a community plugin is added', () => {
    expect(addQuestion('clock', 'someone', undefined, 'community')).toBe('Add clock to your app? It is a community plugin: it runs code written by someone, inside your app, and ACRYL has not reviewed it.')
    expect(addQuestion('office-preview', 'cordisplugins', undefined, 'official')).toBe('Add office-preview to your app? It runs code written by cordisplugins, inside your app.')
  })
})

describe('the Registry tab\'s rules', () => {
  const entries: RegistryEntryView[] = registryEntries(index([
    listed('dice', 'inboxxobni'),
    listed('stock-thing', 'harness', { compatibility: 'DSH stock', description: 'for the stock harness' }),
    listed('pomodoro', 'inboxxobni', { compatibility: 'Both' }),
  ]), NONE)

  it('hides plugins for other apps until asked, and searches name, description and owner', () => {
    expect(filterRegistry(entries, '', false).map(entry => entry.name)).toEqual(['dice', 'pomodoro'])
    expect(filterRegistry(entries, '', true)).toHaveLength(3)
    expect(filterRegistry(entries, 'INBOX pomo', false).map(entry => entry.name)).toEqual(['pomodoro'])
    expect(filterRegistry(entries, 'stock', false)).toEqual([])
    expect(filterRegistry(entries, 'stock', true).map(entry => entry.name)).toEqual(['stock-thing'])
  })

  it('takes only a released address, and speaks plainly about whose code is added', () => {
    expect(cleanAddress('  github:inboxxobni/acrylblends-dice@0.1.0 ')).toBe('github:inboxxobni/acrylblends-dice@0.1.0')
    for (const bad of ['', 'inboxxobni/dice', 'github:a/b', 'https://github.com/a/b', 'github:a/b@1.0.0 && rm -rf', '../x@1.0.0']) expect(cleanAddress(bad)).toBeUndefined()
    expect(addQuestion('dice', 'inboxxobni')).toBe('Add dice to your app? It runs code written by inboxxobni, inside your app.')
    expect(addQuestion('office-preview', 'cordisplugins', 153_160_461)).toBe('Add office-preview to your app? It runs code written by cordisplugins, inside your app. It also downloads 153 MB for this computer.')
    expect(addedText({ name: 'dice', version: '1.0.0', action: 'installed', state: 'active' })).toBe('Done. dice is added to your app as v1.0.0 and running now.')
    expect(addedText({ name: 'dice', version: '1.0.0', action: 'unchanged', state: 'active' })).toContain('nothing changed')
    expect(addedText({ name: 'dice', version: '1.0.0', action: 'installed', state: 'PENDING' })).toContain('not running yet')
    expect(entryByline(entries[0] as RegistryEntryView)).toBe('by inboxxobni · v1.0.0 · 2026-11-01')
  })

  it('asks the Host for the registry and posts one address to add, and carries the plain reason of a refusal', async () => {
    const calls: Array<{ url: string; method?: string; body?: string }> = []
    const api = createRegistryApi(async (url, init) => {
      calls.push({ url, ...(init?.method === undefined ? {} : { method: init.method }), ...(init?.body === undefined ? {} : { body: String(init.body) }) })
      if (url.endsWith('/registry')) return new Response(JSON.stringify({ status: 'unavailable', message: 'down' }), { status: 200 })
      if (url.endsWith('/pull')) return new Response(JSON.stringify({ error: 'Nothing was added.', details: 'refusal: fetch' }), { status: 409 })
      return new Response(JSON.stringify({ status: 'ready', account: 'a' }), { status: 200 })
    })
    expect(await api.registry()).toEqual({ status: 'unavailable', message: 'down' })
    expect(await api.github()).toEqual({ status: 'ready', account: 'a' })
    const refused = await api.add('github:a/b@1.0.0').catch((cause: unknown) => cause)
    expect(refused).toBeInstanceOf(PlainFailure)
    expect(refused).toMatchObject({ message: 'Nothing was added.', details: 'refusal: fetch' })
    expect(JSON.parse(calls.find(call => call.url.endsWith('/pull'))?.body ?? '{}')).toEqual({ source: 'github:a/b@1.0.0' })
  })
})

describe('plain words for sharing', () => {
  const plan: SharePlan = { owner: 'tester', repo: 'hello-share', version: '0.1.0', visibility: 'private', createsRepository: true }

  it('asks who will be able to use the plugin, and keeps the exact sentence and the technical lines for Details', () => {
    expect(shareQuestion(plan)).toBe('Share hello-share with your team? Only people you invite can add it. It is kept on your GitHub account, tester.')
    expect(shareQuestion({ ...plan, visibility: 'public', license: 'MIT' })).toContain('with everyone')
    const registry: SharePlan = { ...plan, visibility: 'public', license: 'MIT', registry: true }
    expect(shareQuestion(registry)).toContain('public registry')
    expect(shareButton(registry)).toBe('List in the registry')
    expect(shareButton(plan)).toBe('Share with my team')
    // The words a person reads carry no git, repository or license terms.
    for (const text of [shareQuestion(plan), shareQuestion(registry), shareButton(registry)]) expect(text).not.toMatch(/repositor|license|\bgit\b|topic/iu)
    expect(shareSentence(registry)).toBe('Create repository tester/hello-share on GitHub and publish v0.1.0? It will be public, under the MIT license: anyone can read it and pull it into their own app. It will be listed in the public Cordis plugin registry.')
    expect(shareDetails(registry)).toEqual([
      shareSentence(registry),
      'Repository: tester/hello-share on GitHub (a new one), public',
      'License: MIT',
      'Topic: cordis-plugin, which cordisplugins.github.io lists within about an hour',
    ])
  })

  it('gives a colleague the address the Registry tab takes', () => {
    expect(colleagueAddress({ url: 'https://github.com/inboxxobni/dice', version: '0.2.0' })).toBe('github:inboxxobni/dice@0.2.0')
    expect(colleagueAddress({ url: 'https://example.com/x', version: '1.0.0' })).toBeUndefined()
  })

  it('reads whether GitHub is ready and turns a tool failure into one thing to do', () => {
    expect(githubReadiness(() => 'ana\n')).toEqual({ status: 'ready', account: 'ana' })
    expect(githubReadiness(() => '')).toMatchObject({ status: 'signed-out', command: 'gh auth login' })
    expect(githubReadiness(() => { throw new Error('gh is not available here: spawn gh ENOENT') })).toMatchObject({ status: 'missing', link: 'https://cli.github.com' })
    expect(githubReadiness(() => { throw new Error('gh failed (sign in with: gh auth login)') })).toMatchObject({ status: 'signed-out' })
    expect(githubReadiness(() => { throw new Error('timeout') })).toMatchObject({ status: 'unavailable' })
    expect(plainShareProblem(new Error('the plan changed since you confirmed it'))).toMatchObject({ say: expect.stringContaining('nothing was sent') })
    expect(plainShareProblem(new Error('found a secret in index.ts'))).toMatchObject({ say: expect.stringContaining('password or a key') })
    const unknown = plainShareProblem(new Error('exit 128: fatal: weird'))
    expect(unknown).toEqual({ say: 'The plugin could not be shared. Nothing was sent.', details: 'exit 128: fatal: weird' })
    expect(plainPullRefusal('folder-exists', 'folder x exists', 'remove it').say).toContain('different plugin with this name')
    expect(plainPullRefusal('inject', 'needs tasks', 'add tasks')).toEqual({ say: expect.stringContaining('needs parts'), details: 'needs tasks - add tasks' })
  })
})

describe('sharing to the registry', () => {
  function standIn() {
    const did: string[] = []
    const ports: SharePorts = {
      host: {
        login: () => 'tester',
        repository: () => undefined,
        createRepository: (owner, repo, visibility) => { did.push(`create ${owner}/${repo} ${visibility}`) },
        setVisibility: () => {},
        addTopics: (owner, repo, topics) => { did.push(`topics ${owner}/${repo} ${topics.join(',')}`) },
        releaseExists: () => false,
        createRelease: (owner, repo, tag) => { did.push(`release ${tag}`); return `https://github.com/${owner}/${repo}/releases/${tag}` },
        cloneUrl: (owner, repo) => `https://github.com/${owner}/${repo}.git`,
      },
      git: { clone: (_url, dir) => { mkdirSync(dir, { recursive: true }) }, commitAll: () => true, tag: () => {}, push: () => {} },
    }
    return { ports, did }
  }
  function app() {
    const root = mkdtempSync(join(tmpdir(), 'frame-registry-'))
    mkdirSync(join(root, 'plugins', 'hello-share'), { recursive: true })
    writeFileSync(join(root, 'plugins', 'hello-share', 'index.ts'), '/** A shared plugin: says hello. */\nexport function apply() {}\n')
    writeFileSync(join(root, 'plugins', 'library.json'), '{"plugins":[]}\n')
    return { root, home: join(root, '.acrylblends') }
  }

  it('a registry plan is public with a license, and only it sets the topic the registry lists by', async () => {
    const { root, home } = app()
    try {
      const own = standIn()
      const plan = await planAppPluginShare(root, home, 'hello-share', { registry: true }, own.ports)
      expect(plan).toMatchObject({ visibility: 'public', license: 'MIT', registry: true })
      expect(parseSharePlan(JSON.parse(JSON.stringify(plan)))).toEqual(plan)
      const shared = await shareAppPlugin(root, home, 'hello-share', plan, {}, own.ports)
      expect(shared).toMatchObject({ registry: true })
      expect(own.did.some(step => step.startsWith('topics tester/hello-share') && step.includes('cordis-plugin'))).toBe(true)
      // A public share that did not ask for the registry puts no topic on the repository.
      const quiet = standIn()
      const publicPlan = await planAppPluginShare(root, home, 'hello-share', { visibility: 'public' }, quiet.ports)
      expect(publicPlan.registry).toBeUndefined()
      await shareAppPlugin(root, home, 'hello-share', publicPlan, {}, quiet.ports)
      expect(quiet.did.some(step => step.startsWith('topics'))).toBe(false)
      // The registry lists public repositories only: a plan that asks for it while private is not a plan.
      expect(() => parseSharePlan({ ...plan, visibility: 'private' })).toThrow()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('the Host routes of the registry', () => {
  const stub = (rejects: (what: string) => Error) => ({
    read: () => Promise.reject(rejects('read')),
    switch: () => Promise.reject(rejects('switch')),
    planShare: () => Promise.reject(rejects('plan')),
    share: () => Promise.reject(rejects('share')),
    save: () => Promise.reject(rejects('save')),
    connect: { start: () => Promise.reject(rejects('connect')), state: () => ({ status: 'idle' as const }), cancel: () => {}, disconnect: () => Promise.reject(new Error('not asked')) },
  })
  const routes = (pull: (source: string) => Promise<unknown>) => frameRoutes({
    state: () => Promise.reject(new Error('not asked')),
    plugins: {
      ...stub(what => new Error(`not asked: ${what}`)),
      registry: () => Promise.resolve({ status: 'unavailable' as const, message: 'down' }),
      github: () => Promise.resolve({ status: 'ready' as const, account: 'ana' }),
      pull: pull as never,
    },
  })
  const call = (app: ReturnType<typeof routes>, path: string, method: 'GET' | 'POST', body?: unknown) => app.fetch(new Request(`http://127.0.0.1:43120${path}`, {
    method,
    headers: { host: '127.0.0.1:43120', origin: 'http://127.0.0.1:43120', 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), { connection: { remoteAddress: '127.0.0.1', localPort: 43120 } })

  it('disconnects GitHub through the Host: DELETE on the readiness route answers with what is left', async () => {
    let disconnected = 0
    const app = frameRoutes({
      state: () => Promise.reject(new Error('not asked')),
      plugins: {
        ...stub(what => new Error(`not asked: ${what}`)),
        connect: { start: () => Promise.reject(new Error('not asked')), state: () => ({ status: 'idle' as const }), cancel: () => {}, disconnect: async () => { disconnected += 1; return { status: 'signed-out' as const, say: 'GitHub is not connected.', command: 'gh auth login' } } },
        registry: () => Promise.reject(new Error('not asked')),
        github: () => Promise.reject(new Error('not asked')),
        pull: () => Promise.reject(new Error('not asked')),
      },
    })
    const answer = await app.fetch(new Request('http://127.0.0.1:43120/api/acryl-blends-frame/plugins/github', {
      method: 'DELETE',
      headers: { host: '127.0.0.1:43120', origin: 'http://127.0.0.1:43120', 'sec-fetch-site': 'same-origin' },
    }), { connection: { remoteAddress: '127.0.0.1', localPort: 43120 } })
    expect(answer.status).toBe(200)
    expect(await answer.json()).toMatchObject({ status: 'signed-out' })
    expect(disconnected).toBe(1)
  })

  it('reads the registry and GitHub, and adds a plugin only for a released github address', async () => {
    const pulled: string[] = []
    const app = routes(async (source) => { pulled.push(source); return { name: 'dice', version: '1.0.0', action: 'installed', state: 'active' } })
    expect(await (await call(app, '/api/acryl-blends-frame/plugins/registry', 'GET')).json()).toEqual({ status: 'unavailable', message: 'down' })
    expect(await (await call(app, '/api/acryl-blends-frame/plugins/github', 'GET')).json()).toEqual({ status: 'ready', account: 'ana' })
    for (const source of ['github:a/b', 'https://evil.example/x.tgz', '../local@1.0.0', 'npm:left-pad@1.0.0', 7, undefined]) {
      expect((await call(app, '/api/acryl-blends-frame/plugins/pull', 'POST', { source })).status).toBe(400)
    }
    expect(pulled).toEqual([])
    const ok = await call(app, '/api/acryl-blends-frame/plugins/pull', 'POST', { source: 'github:inboxxobni/acrylblends-dice@0.1.0' })
    expect(ok.status).toBe(200)
    expect(pulled).toEqual(['github:inboxxobni/acrylblends-dice@0.1.0'])
  })

  it('answers a refused add with the plain sentence and the tool\'s words as details', async () => {
    const app = routes(async () => { throw new PlainError(plainPullRefusal('fetch', 'HTTP 404', 'check the version')) })
    const refused = await call(app, '/api/acryl-blends-frame/plugins/pull', 'POST', { source: 'github:a/b@1.0.0' })
    expect(refused.status).toBe(409)
    expect(await refused.json()).toEqual({ error: expect.stringContaining('could not be downloaded'), details: 'HTTP 404 - check the version' })
  })
})
