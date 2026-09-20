import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { lintPackageDir, installLocalPlugin, listLocalPlugins, removeLocalPlugin } from '../lib/install.js'
import { resolvePackRoot } from '../lib/pack-root.js'
import { createSkillProvider, parseSkill } from '../lib/skills.js'
import { buildRouterText, estimateTokens, ROUTER_TOKEN_BUDGET } from '../lib/router.js'

const manifest = {
  navigation: [
    { title: 'Start here', items: [
      { title: 'This runtime', path: 'start-here/this-runtime.md', applies: 'all' },
      { title: 'Loader internals', path: 'x/loader.md', applies: 'not-for-authors' },
    ] },
  ],
}

test('router names real paths, the policy, the install tool, and omits not-for-authors docs', () => {
  const text = buildRouterText('/pack', manifest)
  assert.match(text, /\/pack\/docs\/README\.md/)
  assert.match(text, /\/pack\/docs\/docs\.json/)
  assert.match(text, /\/pack\/docs\/start-here\/this-runtime\.md/)
  assert.match(text, /\/pack\/examples\/README\.md/)
  assert.match(text, /acryl_install_plugin/)
  assert.match(text, /COMPLETELY/)
  assert.match(text, /cannot publish/)
  assert.doesNotMatch(text, /Loader internals/)
})

test('the real pack router is within the token budget', async () => {
  const { readFileSync } = await import('node:fs')
  const root = resolvePackRoot()
  const real = JSON.parse(readFileSync(join(root, 'docs/docs.json'), 'utf8'))
  const tokens = estimateTokens(buildRouterText(root, real))
  assert.ok(tokens <= ROUTER_TOKEN_BUDGET, `router is ${tokens} tokens, budget ${ROUTER_TOKEN_BUDGET}`)
})

test('resolvePackRoot maps a virtual app.asar path to app.asar.unpacked when it exists', () => {
  const base = mkdtempSync(join(tmpdir(), 'asar-'))
  try {
    const unpacked = join(base, 'app.asar.unpacked', 'node_modules', 'pack')
    mkdirSync(unpacked, { recursive: true })
    const url = pathToFileURL(join(base, 'app.asar', 'node_modules', 'pack', 'lib', 'pack-root.js')).href
    assert.equal(resolvePackRoot(url), unpacked)
    const plain = pathToFileURL(join(base, 'node_modules', 'pack', 'lib', 'pack-root.js')).href
    assert.equal(resolvePackRoot(plain), join(base, 'node_modules', 'pack'))
  } finally { rmSync(base, { recursive: true, force: true }) }
})

function makePkg(over = {}, { patch = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'pkg-'))
  const pkg = { name: 'my-plugin', version: '0.1.0', type: 'module', main: './index.js', exports: { '.': './index.js', './package.json': './package.json' }, files: ['index.js', 'cordis.patch.yml'], dsh: { bundle: { patch: './cordis.patch.yml' } }, ...over }
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg))
  if (patch) writeFileSync(join(dir, 'cordis.patch.yml'), '- insert:\n    - id: my-plugin\n      name: my-plugin\n')
  return dir
}

test('lint accepts a correct package', () => {
  const dir = makePkg()
  try { assert.deepEqual(lintPackageDir(dir), { name: 'my-plugin', hasClient: false, hotShim: false, errors: [] }) } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('lint catches the measured failures: missing bundle, missing patch file, exports without ./package.json', () => {
  const noBundle = makePkg({ dsh: undefined })
  const noPatchFile = makePkg({}, { patch: false })
  const badExports = makePkg({ exports: './index.js' })
  try {
    assert.match(lintPackageDir(noBundle).errors.join('\n'), /dsh.*bundle/)
    assert.match(lintPackageDir(noPatchFile).errors.join('\n'), /does not exist/)
    assert.match(lintPackageDir(badExports).errors.join('\n'), /"\.\/package\.json"/)
    assert.match(lintPackageDir('/nonexistent-dir-xyz').errors.join('\n'), /no package\.json/)
  } finally { for (const d of [noBundle, noPatchFile, badExports]) rmSync(d, { recursive: true, force: true }) }
})

const handle = (exitCode, text = '') => ({ done: Promise.resolve({ exitCode, signal: null }), stdout: (async function* () { yield text })(), stderr: (async function* () {})() })

function fakes({ addExit = 0, activateError = null, removeExit = 0, preinstalled = false } = {}) {
  const calls = []
  const mounted = new Set(preinstalled ? ['my-plugin'] : [])
  return {
    calls,
    pnpm: { runPlugin: (args) => { calls.push(['run', ...args]); return handle(args[0] === 'add' ? addExit : removeExit, args[0] === 'add' && addExit ? 'boom' : '') } },
    live: {
      activate: async name => { calls.push(['activate', name]); if (activateError) throw new Error(activateError); mounted.add(name) },
      deactivate: async name => { calls.push(['deactivate', name]); mounted.delete(name) },
      statusOf: name => (mounted.has(name) ? 'active' : undefined),
    },
  }
}

test('install: lint failure stops before any install', async () => {
  const dir = makePkg({ dsh: undefined }); const s = fakes()
  try {
    const r = await installLocalPlugin({ path: dir }, s)
    assert.equal(r.ok, false); assert.equal(r.stage, 'check'); assert.deepEqual(s.calls, [])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('install: success adds, activates and reports status', async () => {
  const dir = makePkg(); const s = fakes()
  try {
    const r = await installLocalPlugin({ path: dir }, s)
    assert.deepEqual(r, { ok: true, package: 'my-plugin', status: 'active', action: 'installed' })
    assert.deepEqual(s.calls, [['run', 'add', `file:${dir}`], ['activate', 'my-plugin']])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('install: an add failure is reported with the output and nothing is activated', async () => {
  const dir = makePkg(); const s = fakes({ addExit: 1 })
  try {
    const r = await installLocalPlugin({ path: dir }, s)
    assert.equal(r.ok, false); assert.equal(r.stage, 'install'); assert.match(r.detail, /boom/)
    assert.ok(!s.calls.some(c => c[0] === 'activate'))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('install: an activation failure runs the compensating remove and reports rolledBack', async () => {
  const dir = makePkg(); const s = fakes({ activateError: 'Plugin my-plugin failed to activate: deliberate failure' })
  try {
    const r = await installLocalPlugin({ path: dir }, s)
    assert.equal(r.ok, false); assert.equal(r.stage, 'activate'); assert.equal(r.rolledBack, true)
    assert.match(r.errors[0], /deliberate failure/)
    assert.deepEqual(s.calls.at(-1), ['run', 'remove', 'my-plugin'])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('install: missing services are reported, not thrown', async () => {
  const dir = makePkg()
  try {
    assert.equal((await installLocalPlugin({ path: dir }, { pnpm: undefined, live: {} })).stage, 'services')
    assert.equal((await installLocalPlugin({ path: dir }, { pnpm: {}, live: undefined })).stage, 'services')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('skills: frontmatter parses, and the real pack lists its skills with real doc paths', async () => {
  assert.equal(parseSkill('no frontmatter'), undefined)
  assert.deepEqual(parseSkill('---\nname: a-b\ndescription: does x\n---\nbody'), { name: 'a-b', description: 'does x', body: 'body' })
  const root = resolvePackRoot()
  const provider = createSkillProvider(root)
  const list = await provider.list()
  assert.deepEqual(list.map(c => c.name).sort(), ['acryl-add-ui', 'acryl-build-extension', 'acryl-change-plugin', 'acryl-fix-plugin'])
  assert.ok(list.every(c => c.rank === 600 && c.source === 'bundled'))
  const skill = await provider.get(list.find(c => c.name === 'acryl-build-extension'))
  assert.ok(skill.content.includes(join(root, 'docs/start-here/this-runtime.md')))
  assert.doesNotMatch(skill.content, /\{\{pack\}\}/)
})

test('update: an already-mounted plugin is deactivated first, re-added, and warned about host caching', async () => {
  const dir = makePkg(); const s = fakes({ preinstalled: true })
  try {
    const r = await installLocalPlugin({ path: dir }, s)
    assert.equal(r.ok, true); assert.equal(r.action, 'updated'); assert.match(r.warning, /hot shim/)
    assert.deepEqual(s.calls.map(c => c[0]), ['deactivate', 'run', 'activate'])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('update: a plugin using the hot shim gets no caching warning', async () => {
  const dir = makePkg({ files: ['index.js', 'cordis.patch.yml'] })
  writeFileSync(join(dir, 'index.js'), "export async function apply(ctx){ const m = await import(new URL('./impl.js', import.meta.url).href + '?t=' + Date.now()); return m.apply(ctx) }")
  const s = fakes({ preinstalled: true })
  try {
    assert.equal(lintPackageDir(dir).hotShim, true)
    const r = await installLocalPlugin({ path: dir }, s)
    assert.equal(r.warning, undefined)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('list reads file: dependencies of the profile; remove deactivates then removes', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'profile-'))
  try {
    writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: { a: 'file:/src/a', b: '^1.0.0' } }))
    assert.deepEqual(listLocalPlugins(profile), [{ name: 'a', installedFrom: '/src/a' }])
    assert.deepEqual(listLocalPlugins('/nonexistent-profile'), [])
  } finally { rmSync(profile, { recursive: true, force: true }) }
  const calls = []
  const svc = { pnpm: { runPlugin: args => { calls.push(args.join(' ')); return handle(0) } }, live: { deactivate: async n => { calls.push(`deactivate ${n}`) } } }
  const r = await removeLocalPlugin({ package: 'a' }, svc)
  assert.equal(r.ok, true); assert.deepEqual(calls, ['deactivate a', 'remove a'])
  assert.equal((await removeLocalPlugin({}, svc)).ok, false)
})
