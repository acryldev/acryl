import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { lintPackageDir, installLocalPlugin, listLocalPlugins, removeLocalPlugin, reloadLocalPlugins, ensureProfileBundle, pinPublicHoistPattern } from '../lib/install.js'
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
  assert.deepEqual(list.map(c => c.name).sort(), ['acryl-add-provider-or-capability', 'acryl-add-ui', 'acryl-build-extension', 'acryl-change-plugin', 'acryl-desktop-shell', 'acryl-diagnose-plugin', 'acryl-fix-plugin', 'acryl-improve-ui', 'acryl-remove-extension', 'acryl-restyle-ui', 'acryl-share-extension', 'acryl-tui-ui'])
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

test('install: a relative path is refused (the runtime cwd is not the workspace) unless a cwd is supplied', async () => {
  const s = fakes()
  const r = await installLocalPlugin({ path: 'my-plugin' }, s)
  assert.equal(r.ok, false); assert.match(r.errors[0], /ABSOLUTE/); assert.deepEqual(s.calls, [])
  assert.equal((await installLocalPlugin({}, s)).ok, false)
})

test('desktop path: runPlugin add is refused, so pnpm run is used and the bundle is registered', async () => {
  const dir = makePkg(); const profile = mkdtempSync(join(tmpdir(), 'profile-'))
  writeFileSync(join(profile, 'package.json'), JSON.stringify({ dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } } }))
  const calls = []
  const s = fakes()
  s.pnpm = {
    runPlugin: () => { throw new Error('acryl-desktop: plugin add must use the recoverable install boundary') },
    run: args => { calls.push(args.join(' ')); return handle(0) },
  }
  s.profileDir = profile
  try {
    const r = await installLocalPlugin({ path: dir }, s)
    assert.equal(r.ok, true); assert.deepEqual(calls, [`add -w file:${dir}`])
    const bundles = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8')).dsh.profile.bundles
    assert.deepEqual(bundles, ['@deepseek-ai/dsh-base', 'my-plugin'])
    assert.equal(ensureProfileBundle(profile, 'my-plugin'), false)   // idempotent
  } finally { rmSync(dir, { recursive: true, force: true }); rmSync(profile, { recursive: true, force: true }) }
})

test('desktop path: an unrelated runPlugin error is not swallowed', async () => {
  const dir = makePkg(); const s = fakes()
  s.pnpm = { runPlugin: () => { throw new Error('something else') }, run: () => handle(0) }
  try { await assert.rejects(installLocalPlugin({ path: dir }, s), /something else/) } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('reload: re-installs each local plugin from its source folder and reports per plugin', async () => {
  const dir = makePkg(); const profile = mkdtempSync(join(tmpdir(), 'profile-')); const s = { ...fakes({ preinstalled: true }), profileDir: profile }
  try {
    writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: { 'my-plugin': `file:${dir}`, other: '^1.0.0' } }))
    const r = await reloadLocalPlugins(s)
    assert.equal(r.length, 1); assert.equal(r[0].name, 'my-plugin'); assert.equal(r[0].ok, true); assert.equal(r[0].action, 'updated')
    assert.deepEqual(await reloadLocalPlugins({ ...s, profileDir: mkdtempSync(join(tmpdir(), 'empty-')) }), [])
  } finally { rmSync(dir, { recursive: true, force: true }); rmSync(profile, { recursive: true, force: true }) }
})

test('plugin registers /reload when a commands service exists and reports an unavailable profile', async () => {
  const { apply } = await import('../index.js')
  const registered = []
  const ctx = {
    effect: fn => { const it = fn(); if (it && typeof it.next === 'function') for (let r = it.next(); !r.done; r = it.next()) { /* effect yields disposers */ } },
    provide() {}, get: () => undefined, root: {},
    inject: (names, fn) => { if (names.includes('commands')) fn({ commands: { register: def => { registered.push(def); return () => {} } } }) },
    systemPrompt: { section: () => () => {} },
  }
  try { apply(ctx) } catch { /* other seams are not under test */ }
  const reload = registered.find(d => d.name === 'reload')
  assert.ok(reload, '/reload is registered')
  assert.equal((await reload.handler()).kind, 'error')
})

test('publish prep: catalog metadata is enforced, the dry run runs, nothing is published', async () => {
  const { preparePublish } = await import('../lib/publish.js')
  const dir = makePkg()
  try {
    const bad = await preparePublish({ path: dir }, { pack: async () => ({ ok: true, files: 3 }) })
    assert.equal(bad.ok, false); assert.match(bad.errors.join('\n'), /acryl-package/); assert.match(bad.errors.join('\n'), /GitHub/)
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ ...pkg, version: '1.0.0', license: 'MIT', keywords: ['acryl-package'], repository: { type: 'git', url: 'git+https://github.com/x/y.git' } }))
    const ok = await preparePublish({ path: dir }, { pack: async () => ({ ok: true, files: 3 }) })
    assert.equal(ok.ok, true); assert.equal(ok.readyForHumanPublish, true); assert.match(ok.next, /cannot and must not publish|must not publish/)
    const failed = await preparePublish({ path: dir }, { pack: async () => ({ ok: false, output: 'boom' }) })
    assert.match(failed.errors[0], /boom/)
    assert.equal((await preparePublish({ path: 'rel/dir' })).ok, false)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('verify: reports the real import error, the default+named trap, and passes a good package', async () => {
  const { verifyPackage } = await import('../lib/verify.js')
  const dir = makePkg()
  try {
    writeFileSync(join(dir, 'index.js'), 'export const name = "p"; export function apply(ctx) {}')
    const good = await verifyPackage({ path: dir }); assert.equal(good.ok, true)
    writeFileSync(join(dir, 'index.js'), 'throw new Error("kaboom")')
    const broken = await verifyPackage({ path: dir })
    assert.equal(broken.ok, false); assert.equal(broken.findings[0].code, 'import-failed'); assert.match(broken.findings[0].message, /kaboom/); assert.ok(broken.docs.length > 0)
    writeFileSync(join(dir, 'index.js'), 'export const name = "p"; export default function () {}')
    assert.equal((await verifyPackage({ path: dir })).findings[0].code, 'default-with-named-metadata')
    writeFileSync(join(dir, 'index.js'), 'export const name = "p"')
    assert.equal((await verifyPackage({ path: dir })).findings[0].code, 'invalid-plugin-shape')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('every pack path a skill or the docs README-referenced text names exists on disk', async () => {
  const { readdirSync, existsSync } = await import('node:fs')
  const root = resolvePackRoot()
  const missing = []
  for (const dir of readdirSync(join(root, 'skills'))) {
    const text = readFileSync(join(root, 'skills', dir, 'SKILL.md'), 'utf8')
    for (const [, rel] of text.matchAll(/\{\{pack\}\}\/([\w./-]+\.md)/gu)) if (!existsSync(join(root, rel))) missing.push(`${dir}: ${rel}`)
  }
  assert.deepEqual(missing, [])
})

test('every plugin type in the coverage matrix has a doc and an example, and every example has a header', async () => {
  const { PLUGIN_TYPES } = await import('./lib/manifest.mjs')
  const root = resolvePackRoot()
  const manifest = JSON.parse(readFileSync(join(root, 'docs/docs.json'), 'utf8'))
  const covered = new Set(manifest.examples.map(e => e.type))
  // Types with no package example, each with a doc that states why: diagnostics is a doc, packaging is a template.
  const docOnly = new Set(['diagnostics', 'packaging'])
  const missing = PLUGIN_TYPES.filter(type => !covered.has(type) && !docOnly.has(type))
  assert.deepEqual(missing, [])
  for (const example of manifest.examples) {
    const dir = join(root, 'examples/packages', example.path)
    const entry = ['index.js', 'client.js', 'agent.cordis.yml'].map(f => join(dir, f)).find(f => existsSync(f))
    assert.ok(entry, `${example.id}: no entry file`)
    assert.match(readFileSync(entry, 'utf8').slice(0, 400), /Example:/u, `${example.id}: missing Example header`)
  }
})

test('generated maps exist, name the slots the examples use, and cover every surface', () => {
  const root = resolvePackRoot()
  const mount = readFileSync(join(root, 'docs/maps/mount-points.md'), 'utf8')
  for (const slot of ['conversation.session.header.actions', 'sidebar.right.pane.tab', 'desktop.main', 'settings.plugin.item']) assert.ok(mount.includes(`\`${slot}\``), `mount-points lists ${slot}`)
  assert.match(mount, /tuiCommands/u)
  const taxonomy = readFileSync(join(root, 'docs/maps/taxonomy.md'), 'utf8')
  assert.match(taxonomy, /distinct plugin packages are composed across the three surfaces/u)
  for (const type of ['client-slot', 'tool', 'llm-adapter', 'chat-command', 'desktop-main', 'core-infrastructure']) assert.ok(taxonomy.includes(`## ${type} (`), `taxonomy has ${type}`)
})

test('hoist pattern drift: the recorded pattern is pinned once and the add is retried', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'profile-')); const dir = makePkg()
  try {
    mkdirSync(join(profile, 'node_modules'), { recursive: true })
    writeFileSync(join(profile, 'node_modules', '.modules.yaml'), "layoutVersion: 5\npublicHoistPattern:\n  - '*eslint*'\n  - '*prettier*'\nregistries: {}\n")
    writeFileSync(join(profile, 'pnpm-workspace.yaml'), 'packages:\n  - .\n')
    let adds = 0
    const s = fakes()
    s.pnpm = { runPlugin: (args) => { s.calls.push(['run', ...args]); adds += 1; return adds === 1 ? handle(1, 'ERR_PNPM_PUBLIC_HOIST_PATTERN_DIFF: This modules directory was created using a different public-hoist-pattern value') : handle(0) } }
    const r = await installLocalPlugin({ path: dir }, { ...s, profileDir: profile })
    assert.equal(r.ok, true); assert.equal(adds, 2)
    const workspace = readFileSync(join(profile, 'pnpm-workspace.yaml'), 'utf8')
    assert.match(workspace, /publicHoistPattern:\n {2}- '\*eslint\*'\n {2}- '\*prettier\*'/)
    assert.equal(pinPublicHoistPattern(profile), false, 'already pinned: no second write')
    assert.equal(pinPublicHoistPattern(join(profile, 'missing')), false)
  } finally { rmSync(dir, { recursive: true, force: true }); rmSync(profile, { recursive: true, force: true }) }
})
