import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  bumpPackageVersion, checkedShares, commitMaker, docSummary, extensionsOff, frameRowState, isFramePlugin, packageAppPlugin, parseBlendRows, planAppPluginShare,
  insideApp, pluginPackageManifest, pluginPackagesOf, readAppPlugins, readSharedRecords, recordShare, saveAppPlugin, setMadeOn, setRowOn, shareAppPlugin, switchAppPlugin,
  type SharePorts,
} from '../src/app-plugins.ts'
import { appPluginRow, createAppPluginsApi, filterPlugins, framePluginRow, madeWhen, pullCommand, shareSentence } from '../src/client/plugins-navigator.ts'
import { feedbackPlace, feedbackTask } from '../src/client/feedback.ts'
import { frameRoutes } from '../src/index.ts'
import { parseAppPluginsView, parseFeedbackView, parseSharePlan, type SharePlan } from '../src/contract.ts'

const BLEND = `spec:
  runtime: cordis
  rows:
    - id: tasks
      name: tasks
      config:
        store: "{{parameters.taskStore}}"
    # The agent's model.
    - id: model
      name: model
    - id: extensions
      name: extensions
      config:
        approval: "{{parameters.approval}}"
    # The panel: a chat button on every page.
    - id: agent-panel
      name: agent-panel
`

describe('blend.yaml rows', () => {
  it('reads each row with the comment above it', () => {
    expect(parseBlendRows(BLEND).map(row => [row.id, row.name, row.disabled, row.comment])).toEqual([
      ['tasks', 'tasks', false, ''],
      ['model', 'model', false, "The agent's model."],
      ['extensions', 'extensions', false, ''],
      ['agent-panel', 'agent-panel', false, 'The panel: a chat button on every page.'],
    ])
  })

  it('switches a row off and on again, leaving every other line as it was', () => {
    const off = setRowOn(BLEND, 'model', false)
    expect(off).toContain('    - id: model\n      disabled: true\n      name: model\n')
    expect(parseBlendRows(off).find(row => row.id === 'model')?.disabled).toBe(true)
    expect(setRowOn(off, 'model', true)).toBe(BLEND)
    expect(() => setRowOn(BLEND, 'nope', false)).toThrow('no row')
  })

  it('keeps a plugin from plugins/ off in the extensions row, and drops the list when none is off', () => {
    const off = setMadeOn(BLEND, 'due-dates', false)
    expect(off).toContain('      config:\n        off: [due-dates]\n        approval:')
    expect(extensionsOff(setMadeOn(off, 'board-mobile', false))).toEqual(['due-dates', 'board-mobile'])
    expect(setMadeOn(off, 'due-dates', true)).toBe(BLEND)
  })
})

describe('the plugins navigator', () => {
  it('names the agent of a co-authored commit as the maker', () => {
    expect(commitMaker('Ana', 'feat: due dates\n\nCo-Authored-By: Claude <noreply@anthropic.com>')).toBe('Claude')
    expect(commitMaker('Ana', 'feat: due dates')).toBe('Ana')
  })

  it('lists the frame plugins around the app, not the rows that run it', () => {
    expect(isFramePlugin('acryl-versions', 'acryl-versions')).toBe(true)
    expect(isFramePlugin('./frame/app-plugins.mjs', 'app-plugins')).toBe(false)
    expect(isFramePlugin('@deepseek-ai/dsh-agent', 'agent')).toBe(false)
  })

  it('says when a plugin was made, and filters by group and text', () => {
    const now = new Date('2026-11-03T15:00:00')
    expect(madeWhen('2026-11-03T09:00:00', now)).toBe('today')
    expect(madeWhen('2026-11-02T09:00:00', now)).toBe('yesterday')
    const row = framePluginRow({ id: 'acryl-versions', name: 'acryl-versions', version: '0.1.0', description: 'Versions', state: 'active' })
    expect(row.toggle).toBeUndefined()
    expect(row.by).toBe('frame · v0.1.0')
    expect(filterPlugins([row], 'versions', 'frame')).toEqual([row])
    expect(filterPlugins([row], '', 'made')).toEqual([])
  })

  it('reads a frame row\'s state from its fiber', () => {
    expect(frameRowState({ id: 'a', name: 'acryl-a', disabled: false, fiberState: 2 })).toBe('active')
    expect(frameRowState({ id: 'a', name: 'acryl-a', disabled: false, fiberState: 0 })).toBe('waiting')
    expect(frameRowState({ id: 'a', name: 'acryl-a', disabled: false, fiberState: 3 })).toBe('failed')
    expect(frameRowState({ id: 'a', name: 'acryl-a', disabled: true, fiberState: undefined })).toBe('off')
  })

  it('describes a library plugin by the first sentence of its doc comment', () => {
    expect(docSummary('/**\n * The extensions service (`ctx.extensions`): install and reload plugins. More here.\n *\n * Later.\n */\nexport {}'))
      .toBe('The extensions service (ctx.extensions): install and reload plugins.')
    expect(docSummary('export const x = 1')).toBe('')
  })
})

describe('the app\'s own plugins', () => {
  const noGit = { run: () => Promise.reject(new Error('not a repository')) }

  it('lists a plugin its blend.yaml row mounts once, as made, and switches it by that row', async () => {
    const root = mkdtempSync(join(tmpdir(), 'frame-own-'))
    try {
      for (const name of ['notes', 'loose', 'home']) {
        mkdirSync(join(root, 'plugins', name), { recursive: true })
        writeFileSync(join(root, 'plugins', name, 'index.ts'), `/** The ${name} plugin. */\nexport function apply() {}\n`)
      }
      writeFileSync(join(root, 'plugins', 'library.json'), '{"plugins":["home"]}\n')
      writeFileSync(join(root, 'blend.yaml'), 'spec:\n  rows:\n    - id: home\n      name: home\n    - id: notes\n      name: notes\n    - id: extensions\n      name: extensions\n')
      const listed = await readAppPlugins(root, noGit)
      expect(listed.map(plugin => [plugin.name, plugin.kind, plugin.on])).toEqual([
        ['loose', 'made', true],
        ['notes', 'made', true],
        ['home', 'row', true],
        ['extensions', 'row', true],
      ])
      await switchAppPlugin(root, 'made', 'notes', false)
      const text = readFileSync(join(root, 'blend.yaml'), 'utf8')
      expect(parseBlendRows(text).find(row => row.id === 'notes')?.disabled).toBe(true)
      expect(extensionsOff(text)).toEqual([])
      expect((await readAppPlugins(root, noGit)).find(plugin => plugin.name === 'notes')?.on).toBe(false)
      await switchAppPlugin(root, 'made', 'loose', false)
      expect(extensionsOff(readFileSync(join(root, 'blend.yaml'), 'utf8'))).toEqual(['loose'])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('sharing a local plugin', () => {
  const plugin = { name: 'hello-share', kind: 'made' as const, by: 'Ana', at: '2026-11-03T09:00:00', description: 'A shared plugin', on: true }
  const where = { url: 'https://github.com/inboxxobni/hello-share', version: '0.1.0' }

  const plan: SharePlan = { owner: 'tester', repo: 'hello-share', version: '0.1.0', visibility: 'private', createsRepository: true }

  it('offers Share on a local row, and a shared row shows where it went', () => {
    const share = { plan: () => Promise.resolve(plan), publish: () => Promise.resolve(where) }
    expect(appPluginRow(plugin, () => Promise.resolve(), share).share).toBe(share)
    expect(appPluginRow({ ...plugin, shared: where }, () => Promise.resolve()).shared).toEqual(where)
    // A library row is already published by its library; it is not shared from the app.
    const library = { name: 'tasks', kind: 'row' as const, description: 'Tasks', version: '1.0.0', on: true }
    expect(appPluginRow(library, () => Promise.resolve(), share).share).toBeUndefined()
  })

  it('asks a question naming the repository, whether it is created, the version and who can see it', () => {
    expect(shareSentence(plan)).toBe('Create repository tester/hello-share on GitHub and publish v0.1.0? It will be private.')
    expect(shareSentence({ ...plan, createsRepository: false, version: '0.1.1', released: '0.1.0', visibility: 'public' }))
      .toBe('Publish v0.1.1 to tester/hello-share on GitHub? v0.1.0 is released there, so this is the next version. It will be public, under the MIT license: anyone can read it and pull it into their own app.')
    expect(parseSharePlan(JSON.parse(JSON.stringify(plan)))).toEqual(plan)
    expect(() => parseSharePlan({ ...plan, owner: '../x' })).toThrow('repository')
    expect(() => parseSharePlan(undefined)).toThrow('not a plan')
  })

  it('packages a local plugin the way the builder does, under the app\'s home, and remembers only a completed share', async () => {
    const root = mkdtempSync(join(tmpdir(), 'frame-share-'))
    try {
      mkdirSync(join(root, 'plugins', 'hello-share'), { recursive: true })
      writeFileSync(join(root, 'plugins', 'hello-share', 'index.ts'), '/** A shared plugin: says hello. */\nexport function apply() {}\n')
      writeFileSync(join(root, 'plugins', 'library.json'), '{"plugins":[]}\n')
      const home = join(root, '.acrylblends')
      const dir = await packageAppPlugin(root, 'hello-share', pluginPackagesOf(home))
      expect(dir).toBe(join(home, 'plugin-packages', 'hello-share'))
      // Nothing lands in the app's own folder, so a share leaves no file to save.
      expect(existsSync(join(root, 'plugin-packages'))).toBe(false)
      const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Record<string, unknown>
      expect(manifest.name).toBe('hello-share')
      expect(manifest.version).toBe('0.1.0')
      expect(manifest.peerDependencies).toEqual({ '@deepseek-ai/cordis': '4.0.4' })
      expect(manifest.dsh).toEqual({ bundle: { patch: './cordis.patch.yml' } })
      expect(readFileSync(join(dir, 'cordis.patch.yml'), 'utf8')).toContain('id: hello-share')
      expect(readFileSync(join(dir, 'index.ts'), 'utf8')).toContain('A shared plugin')
      const records = join(root, 'shared-plugins.json')
      expect(await readSharedRecords(records)).toEqual({})
      await recordShare(records, 'hello-share', where)
      expect(await readSharedRecords(records)).toEqual({ 'hello-share': where })
      expect(await readSharedRecords(join(root, 'missing.json'))).toEqual({})
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
    expect(pluginPackageManifest('hello-share', 'd').keywords).toEqual(['cordis', 'cordis-plugin', 'acrylblends'])
  })

  /** A GitHub that records what it was asked to do, and a git that clones into an empty folder: nothing leaves the machine. */
  function standIn(repos: Record<string, { readonly releases: string[] }> = {}) {
    const did: string[] = []
    const ports: SharePorts = {
      host: {
        login: () => { did.push('login'); return 'tester' },
        repository: (owner, repo) => (repos[`${owner}/${repo}`] === undefined ? undefined : { visibility: 'private', url: `https://github.com/${owner}/${repo}` }),
        createRepository: (owner, repo, visibility) => { did.push(`create ${owner}/${repo} ${visibility}`); repos[`${owner}/${repo}`] = { releases: [] } },
        setVisibility: (owner, repo, visibility) => { did.push(`visibility ${owner}/${repo} ${visibility}`) },
        addTopics: () => {},
        releaseExists: (owner, repo, tag) => repos[`${owner}/${repo}`]?.releases.includes(tag) === true,
        createRelease: (owner, repo, tag) => { did.push(`release ${owner}/${repo} ${tag}`); repos[`${owner}/${repo}`]?.releases.push(tag); return `https://github.com/${owner}/${repo}/releases/${tag}` },
        cloneUrl: (owner, repo) => `https://github.com/${owner}/${repo}.git`,
      },
      git: {
        clone: (_url, dir) => { mkdirSync(dir, { recursive: true }) },
        commitAll: () => true,
        tag: () => {},
        push: (_dir, tag) => { did.push(`push ${tag}`) },
      },
    }
    return { ports, did }
  }

  function appWithPlugin(): { root: string; home: string } {
    const root = mkdtempSync(join(tmpdir(), 'frame-share-'))
    mkdirSync(join(root, 'plugins', 'hello-share'), { recursive: true })
    writeFileSync(join(root, 'plugins', 'hello-share', 'index.ts'), '/** A shared plugin: says hello. */\nexport function apply() {}\n')
    writeFileSync(join(root, 'plugins', 'library.json'), '{"plugins":[]}\n')
    return { root, home: join(root, '.acrylblends') }
  }

  it('plans without sending anything, and publishes exactly the confirmed plan', async () => {
    const { root, home } = appWithPlugin()
    try {
      const { ports, did } = standIn()
      expect(await planAppPluginShare(root, home, 'hello-share', {}, ports)).toEqual(plan)
      expect(did).toEqual(['login'])
      const shared = await shareAppPlugin(root, home, 'hello-share', plan, {}, ports)
      expect(shared).toEqual({ url: 'https://github.com/tester/hello-share', version: '0.1.0', owner: 'tester', repo: 'hello-share', tag: 'v0.1.0' })
      expect(did.slice(1)).toEqual(['login', 'create tester/hello-share private', 'push v0.1.0', 'release tester/hello-share v0.1.0'])
      expect(await readSharedRecords(join(home, 'shared-plugins.json'))).toEqual({ 'hello-share': { url: shared.url, version: '0.1.0' } })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('sends nothing when the plan changed after the yes: another owner, or a repository made meanwhile', async () => {
    const { root, home } = appWithPlugin()
    try {
      // The frame is set to share to a test organization: the plan the person saw named their own account.
      const { ports, did } = standIn()
      await expect(shareAppPlugin(root, home, 'hello-share', plan, { owner: 'inboxxobni' }, ports)).rejects.toThrow('nothing was sent')
      const meanwhile = standIn({ 'tester/hello-share': { releases: [] } })
      await expect(shareAppPlugin(root, home, 'hello-share', plan, {}, meanwhile.ports)).rejects.toThrow('changed since you confirmed')
      expect([...did, ...meanwhile.did].filter(step => step !== 'login')).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('shares to the configured organization, and plans the next patch once a version is released', async () => {
    const { root, home } = appWithPlugin()
    try {
      const { ports, did } = standIn({ 'inboxxobni/hello-share': { releases: ['v0.1.0'] } })
      const next = await planAppPluginShare(root, home, 'hello-share', { owner: 'inboxxobni' }, ports)
      expect(next).toEqual({ owner: 'inboxxobni', repo: 'hello-share', version: '0.1.1', visibility: 'private', createsRepository: false, released: '0.1.0' })
      expect((await shareAppPlugin(root, home, 'hello-share', next, { owner: 'inboxxobni' }, ports)).tag).toBe('v0.1.1')
      // The account signed in is never asked when the frame names the owner.
      expect(did).toEqual(['push v0.1.1', 'release inboxxobni/hello-share v0.1.1'])
      expect(JSON.parse(readFileSync(join(pluginPackagesOf(home), 'hello-share', 'package.json'), 'utf8')).version).toBe('0.1.1')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('is private unless the person chose public, and publishes with the visibility they confirmed', async () => {
    const { root, home } = appWithPlugin()
    try {
      const { ports, did } = standIn({})
      expect((await planAppPluginShare(root, home, 'hello-share', { owner: 'inboxxobni' }, ports)).visibility).toBe('private')
      const open = await planAppPluginShare(root, home, 'hello-share', { owner: 'inboxxobni', visibility: 'public' }, ports)
      // A public plan names its license (MIT unless the app says otherwise), and a private one has none.
      expect(open).toMatchObject({ visibility: 'public', license: 'MIT' })
      const closed = await planAppPluginShare(root, home, 'hello-share', { owner: 'inboxxobni' }, ports)
      expect(closed.license).toBeUndefined()
      // A plan confirmed as private is not published as public: a changed visibility or license is refused, nothing is sent.
      await expect(shareAppPlugin(root, home, 'hello-share', { ...open, visibility: 'private' }, { owner: 'inboxxobni' }, ports)).rejects.toThrow('changed since you confirmed')
      expect(did.filter(step => step !== 'login')).toEqual([])
      // The package of a public share carries the license the plan named.
      await shareAppPlugin(root, home, 'hello-share', open, { owner: 'inboxxobni' }, ports)
      expect(JSON.parse(readFileSync(join(pluginPackagesOf(home), 'hello-share', 'package.json'), 'utf8')).license).toBe('MIT')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('asks the Host for the plan, then posts the share with the confirmed plan', async () => {
    const calls: Array<{ url: string; body: string }> = []
    const api = createAppPluginsApi(async (url, init) => {
      calls.push({ url, body: String(init?.body) })
      return new Response(JSON.stringify(url.endsWith('/share-plan') ? plan : { url: where.url, version: where.version, owner: 'inboxxobni', repo: 'hello-share', tag: 'v0.1.0' }), { status: 200 })
    })
    expect(await api.planShare('hello-share')).toEqual(plan)
    expect(await api.share('hello-share', plan)).toEqual(where)
    expect(calls.map(call => call.url)).toEqual(['/api/acryl-blends-frame/plugins/share-plan', '/api/acryl-blends-frame/plugins/share'])
    expect(JSON.parse(calls[0]?.body ?? '{}')).toEqual({ name: 'hello-share' })
    expect(JSON.parse(calls[1]?.body ?? '{}')).toEqual({ name: 'hello-share', confirm: plan })
    const failed = createAppPluginsApi(async () => new Response(JSON.stringify({ error: 'it could not be shared' }), { status: 409 }))
    await expect(failed.share('hello-share', plan)).rejects.toThrow('it could not be shared')
  })

  it('the Host publishes only a confirmed plan, never on a bare request', async () => {
    const shares: SharePlan[] = []
    const app = frameRoutes({
      state: () => Promise.reject(new Error('not asked')),
      plugins: {
        connect: { start: () => Promise.reject(new Error('not asked')), state: () => ({ status: 'idle' as const }), cancel: () => {} },
        read: () => Promise.reject(new Error('not asked')),
        switch: () => Promise.reject(new Error('not asked')),
        planShare: async () => plan,
        share: async (_name, confirmed) => { shares.push(confirmed); return { ...where, owner: 'tester', repo: 'hello-share', tag: 'v0.1.0' } },
        save: () => Promise.reject(new Error('not asked')),
        registry: () => Promise.reject(new Error('not asked')),
        pull: () => Promise.reject(new Error('not asked')),
        github: () => Promise.reject(new Error('not asked')),
      },
    })
    const post = (path: string, body: unknown) => app.fetch(new Request(`http://127.0.0.1:43120${path}`, {
      method: 'POST',
      headers: { host: '127.0.0.1:43120', origin: 'http://127.0.0.1:43120', 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }), { connection: { remoteAddress: '127.0.0.1', localPort: 43120 } })
    expect(await (await post('/api/acryl-blends-frame/plugins/share-plan', { name: 'hello-share' })).json()).toEqual(plan)
    const bare = await post('/api/acryl-blends-frame/plugins/share', { name: 'hello-share' })
    expect(bare.status).toBe(400)
    expect(await bare.json()).toEqual({ error: 'a share is published only after the person confirms its plan' })
    expect(shares).toEqual([])
    expect((await post('/api/acryl-blends-frame/plugins/share', { name: 'hello-share', confirm: plan })).status).toBe(200)
    expect(shares).toEqual([plan])
  })

  it('bumps a package folder one patch and writes it back', async () => {
    const root = mkdtempSync(join(tmpdir(), 'frame-bump-'))
    try {
      writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'hello-share', version: '1.2.3' }))
      expect(await bumpPackageVersion(root)).toBe('1.2.4')
      expect(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version).toBe('1.2.4')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('marks a share gone only on GitHub\'s word that the repository does not exist', async () => {
    const records = {
      gone: { url: 'https://github.com/ana/gone', version: '0.1.0' },
      here: { url: 'https://github.com/ana/here', version: '0.2.0' },
      offline: { url: 'https://github.com/ana/offline', version: '0.3.0' },
    }
    const answers: Record<string, boolean | undefined> = { 'https://github.com/ana/gone': false, 'https://github.com/ana/here': true }
    expect(await checkedShares(records, async url => answers[url])).toEqual({
      gone: { url: 'https://github.com/ana/gone', version: '0.1.0', gone: true },
      here: records.here,
      offline: records.offline,
    })
    const view = parseAppPluginsView({ plugins: [{ name: 'gone', kind: 'made', description: 'd', on: true, shared: { ...records.gone, gone: true } }], frame: [] })
    expect(view.plugins[0]?.shared).toEqual({ ...records.gone, gone: true })
  })

  it('keeps the share record in the plugin list the page reads', () => {
    const view = parseAppPluginsView({
      plugins: [{ name: 'hello-share', kind: 'made', description: 'A shared plugin', on: true, shared: where }],
      frame: [],
    })
    expect(view.plugins[0]?.shared).toEqual(where)
  })
})

describe('seeing a plugin\'s code and keeping it on this machine', () => {
  const noGit = { run: () => Promise.reject(new Error('not a repository')) }

  it('tells where each plugin\'s code is: its folder, and its main file when that is inside the app', async () => {
    const root = mkdtempSync(join(tmpdir(), 'frame-where-'))
    try {
      mkdirSync(join(root, 'plugins', 'cart'), { recursive: true })
      writeFileSync(join(root, 'plugins', 'cart', 'index.ts'), '/** The cart. */\nexport function apply() {}\n')
      mkdirSync(join(root, 'plugins', 'home'), { recursive: true })
      writeFileSync(join(root, 'plugins', 'home', 'index.ts'), '/** The home page. */\nexport function apply() {}\n')
      // A library copy whose code starts in src/, one that names its file in package.json, and one with only a README.
      mkdirSync(join(root, 'plugins', 'router', 'src'), { recursive: true })
      writeFileSync(join(root, 'plugins', 'router', 'src', 'index.ts'), 'export {}\n')
      mkdirSync(join(root, 'plugins', 'named'), { recursive: true })
      writeFileSync(join(root, 'plugins', 'named', 'package.json'), '{"name":"named","main":"./lib/start.js"}\n')
      mkdirSync(join(root, 'plugins', 'named', 'lib'), { recursive: true })
      writeFileSync(join(root, 'plugins', 'named', 'lib', 'start.js'), 'export {}\n')
      writeFileSync(join(root, 'plugins', 'library.json'), '{"plugins":["home","router","named"]}\n')
      writeFileSync(join(root, 'blend.yaml'), 'spec:\n  rows:\n    - id: home\n      name: home\n    - id: cart\n      name: cart\n    - id: router\n      name: router\n    - id: named\n      name: named\n    - id: gone\n      name: not-installed\n')
      const listed = await readAppPlugins(root, noGit)
      const by = (name: string) => listed.find(plugin => plugin.name === name)
      expect(by('cart')).toMatchObject({ kind: 'made', folder: join(root, 'plugins', 'cart'), main: 'plugins/cart/index.ts' })
      expect(by('home')).toMatchObject({ kind: 'row', folder: join(root, 'plugins', 'home'), main: 'plugins/home/index.ts' })
      // A row whose package is not installed has no code to show, and says nothing rather than guess.
      expect(by('router')).toMatchObject({ folder: join(root, 'plugins', 'router'), main: 'plugins/router/src/index.ts' })
      expect(by('named')).toMatchObject({ main: 'plugins/named/lib/start.js' })
      expect(by('not-installed')?.folder).toBeUndefined()
      expect(insideApp(root, join(root, 'plugins', 'cart', 'index.ts'))).toBe('plugins/cart/index.ts')
      expect(insideApp(root, join(tmpdir(), 'elsewhere', 'index.ts'))).toBeUndefined()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('keeps a packed copy on this machine once, and gives a changed plugin the next version instead of overwriting', async () => {
    const root = mkdtempSync(join(tmpdir(), 'frame-save-'))
    try {
      mkdirSync(join(root, 'plugins', 'cart'), { recursive: true })
      writeFileSync(join(root, 'plugins', 'cart', 'index.ts'), '/** The cart. */\nexport function apply() {}\n')
      writeFileSync(join(root, 'plugins', 'library.json'), '{"plugins":[]}\n')
      writeFileSync(join(root, 'blend.yaml'), 'spec:\n  rows:\n    - id: cart\n      name: cart\n')
      const home = join(root, 'home')
      const first = await saveAppPlugin(root, home, 'cart')
      expect(first).toMatchObject({ version: '0.1.0', added: true, bumped: false })
      expect(existsSync(first.path)).toBe(true)
      expect(first.path.startsWith(home)).toBe(true)
      // The same plugin again is the same copy, not a second one.
      expect(await saveAppPlugin(root, home, 'cart')).toMatchObject({ version: '0.1.0', added: false, bumped: false })
      // The card reads what is saved from the store.
      const store = join(home, 'plugins', '.store')
      expect((await readAppPlugins(root, noGit, undefined, undefined, store)).find(plugin => plugin.name === 'cart')?.saved).toEqual({ version: '0.1.0', path: first.path })
      // A changed plugin cannot take over version 0.1.0: it is saved as the next version and the first copy stays.
      writeFileSync(join(root, 'plugins', 'cart', 'index.ts'), '/** The cart, now with a total. */\nexport function apply() { return 1 }\n')
      const next = await saveAppPlugin(root, home, 'cart')
      expect(next).toMatchObject({ version: '0.1.1', added: true, bumped: true })
      expect(existsSync(first.path)).toBe(true)
      expect(next.path).not.toBe(first.path)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('gives the card its actions, and the pull command of a shared plugin', () => {
    const plugin = { name: 'cart', kind: 'made' as const, description: 'Cart', on: true, folder: '/app/plugins/cart', main: 'plugins/cart/index.ts', saved: { version: '0.1.0', path: '/home/x.tgz' } }
    const viewSource = () => {}
    const row = appPluginRow(plugin, () => Promise.resolve(), undefined, undefined, { viewSource })
    expect(row).toMatchObject({ folder: '/app/plugins/cart', saved: { version: '0.1.0' } })
    expect(row.actions?.viewSource).toBe(viewSource)
    expect(framePluginRow({ id: 'x', name: 'acryl-x', description: '', state: 'active', folder: '/app/node_modules/acryl-x' }, { viewSource }).folder).toBe('/app/node_modules/acryl-x')
    expect(pullCommand({ url: 'https://github.com/musichen/cart', version: '0.1.0' })).toBe('npm run acryl -- plugin pull github:musichen/cart@0.1.0')
    expect(pullCommand({ url: 'https://example.com/x', version: '0.1.0' })).toBeUndefined()
  })

  it('asks the Host to save, and shows the Host\'s reason when it cannot', async () => {
    const api = createAppPluginsApi(async (url, init) => {
      expect(url).toBe('/api/acryl-blends-frame/plugins/save')
      expect(JSON.parse(String(init?.body))).toEqual({ name: 'cart' })
      return new Response(JSON.stringify({ version: '0.1.0', path: '/home/cart-0.1.0.tgz', added: true, bumped: false }), { status: 200 })
    })
    expect(await api.save('cart')).toEqual({ version: '0.1.0', path: '/home/cart-0.1.0.tgz', added: true, bumped: false })
    const failed = createAppPluginsApi(async () => new Response(JSON.stringify({ error: 'it could not be saved' }), { status: 409 }))
    await expect(failed.save('cart')).rejects.toThrow('it could not be saved')
  })
})

describe('feedback screenshots', () => {
  it('keeps a note screenshot in the view, and drops a malformed one', () => {
    const view = parseFeedbackView({
      available: true,
      notes: [{
        id: 'n1', at: '2026-11-03T10:00:00Z', text: 'cut off', page: '/app/', seen: false,
        screenshot: { mediaType: 'image/webp', width: 800, height: 600 },
      }],
    })
    expect(view.notes[0]?.screenshot).toEqual({ mediaType: 'image/webp', width: 800, height: 600 })
    const broken = parseFeedbackView({
      available: true,
      notes: [{ id: 'n2', at: '2026-11-03T10:00:00Z', text: 'x', page: '/', seen: false, screenshot: { mediaType: 'image/gif', width: 1, height: 1 } }],
    })
    expect(broken.notes[0]?.screenshot).toBeUndefined()
  })
})

describe('feedback from users', () => {
  const note = { id: 'n1', at: '2026-11-03T10:00:00Z', text: 'Due date is "cut off"', page: '/app/board?x=1', element: { selector: 'li:nth-of-type(2)', label: 'li "Fix the invite link"' }, seen: false }

  it('names the page a note came from', () => {
    expect(feedbackPlace(note, '/app')).toBe('board page')
    expect(feedbackPlace({ page: '/app/' }, '/app')).toBe('Home page')
  })

  it('hands an agent the page, the element and the note quoted as data', () => {
    const task = feedbackTask(note)
    expect(task).toContain('Page: /app/board?x=1')
    expect(task).toContain('Element: li "Fix the invite link" (selector: li:nth-of-type(2))')
    expect(task).toContain('"Due date is \\"cut off\\""')
    const { element: _pinned, ...general } = note
    expect(feedbackTask(general)).toContain('Element: nothing specific')
  })

  it("reads the Host's answer, and no section without the plugin", () => {
    expect(parseFeedbackView({ available: false, notes: [] })).toEqual({ available: false, notes: [] })
    expect(parseFeedbackView({ available: true, notes: [note] }).notes[0]?.element?.label).toBe('li "Fix the invite link"')
    expect(() => parseFeedbackView({ available: true, notes: [{ id: 1 }] })).toThrow('note')
  })
})
