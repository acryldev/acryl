// Live install and hot reload of an agent-written plugin, on whatever runtime runs this file (Node or Deno). It is the same flow as the Node test
// "host code updates take effect in the running process without a hot shim (automatic reload)" in runtime/acryl-harness-runtime/tests/extension-context.spec.ts:
// boot the real web engine host, write a plugin package into a workspace, install it with `installLocalPlugin` (what the agent's `acryl_install_plugin` tool
// calls: `dsh plugin add` through the pinned pnpm, then live activation), then change BOTH its entry file and the file it imports and install again.
// The plugin records what it was evaluated with on `globalThis`, so the probe reads what the running process really holds.
//
// Run from the repository root with throwaway homes (never the real ones; the install also writes a pnpm shim under ACRYL_HOME):
//   T=$(mktemp -d); mkdir -p $T/home $T/acryl $T/dsh $T/ws
//   HOME=$T/home ACRYL_HOME=$T/acryl DSH_HOME=$T/dsh WORKSPACE=$T/ws deno run -A --node-modules-dir=manual specs/042-.../probes/live-install.mjs
//   (node specs/042-.../probes/live-install.mjs works too: that is the baseline; `ACRYL_NODE_SIDECAR=$(which node) bun run specs/042-.../probes/live-install.mjs` is the Bun run)
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
for (const name of ['HOME', 'ACRYL_HOME', 'DSH_HOME', 'WORKSPACE']) {
  if (!process.env[name]) { console.error(`set ${name} to a throwaway folder`); process.exit(2) }
}
// Under Deno or Bun, `process.execPath` is that runtime's binary (in a `deno desktop` app: the GUI executable), but the Harness spawns it as "node" (pnpm, `dsh plugin add`,
// MCP servers, the subprocess runner). A Node sidecar given here replaces it, the way the AcrylDeno launcher does.
if (process.env.ACRYL_NODE_SIDECAR) process.execPath = process.env.ACRYL_NODE_SIDECAR // Deno's execPath is an accessor with a setter (not configurable, so defineProperty fails)
const runtime = typeof Bun !== 'undefined' ? `bun ${Bun.version}` : typeof Deno === 'undefined' ? `node ${process.version}` : `deno ${Deno.version.deno}`
const anchor = process.env.PAYLOAD ? resolve(process.env.PAYLOAD, 'package.json') : resolve(repo, 'apps/acryl-web/package.json')
const require = createRequire(pathToFileURL(anchor))
const load = async specifier => import(pathToFileURL(require.resolve(specifier)).href)
const { createAcrylEngineHost, createWebEngineDefinition } = await load('acryl-harness-runtime')
const { provideCmdline } = await load('@deepseek-ai/dsh-cmdline')
const extensionContextDir = process.env.PAYLOAD ? dirname(require.resolve('acryl-extension-context/package.json')) : resolve(repo, 'plugins/acryl-extension-context')
const { installLocalPlugin } = await import(pathToFileURL(join(extensionContextDir, 'lib/install.js')).href)

const dir = join(process.env.WORKSPACE, '.acryl-extensions', 'probe')
mkdirSync(dir, { recursive: true })
const write = (entryText, helperText) => {
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: 'acryl-probe-hot', version: '0.1.0', type: 'module', main: './index.js',
    exports: { '.': './index.js', './package.json': './package.json' },
    files: ['index.js', 'helper.js', 'cordis.patch.yml'],
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }))
  writeFileSync(join(dir, 'cordis.patch.yml'), '- insert:\n    - id: probe-hot\n      name: acryl-probe-hot\n')
  writeFileSync(join(dir, 'helper.js'), `export const text = ${JSON.stringify(helperText)}\n`)
  writeFileSync(join(dir, 'index.js'), [
    "import { text } from './helper.js'",
    "export const name = 'acryl-probe-hot'",
    'export function apply(ctx) {',
    `  globalThis.__probeHot = ${JSON.stringify(entryText)} + text`,
    "  ctx.effect(() => () => { globalThis.__probeHot = 'disposed' }, 'probe')",
    '}',
  ].join('\n'))
}
const brief = value => JSON.stringify(value, (_, v) => typeof v === 'string' && v.length > (Number(process.env.PROBE_DETAIL) || 200) ? v.slice(0, Number(process.env.PROBE_DETAIL) || 200) + '...' : v)
// A failed install leaves no trace in its own result: list the Cordis fibers that are not ACTIVE (3 = FAILED, its error is on `_error`; 0 = PENDING).
const problems = () => {
  for (const [, runtime] of host.ctx.registry.entries()) {
    for (const fiber of runtime.fibers) {
      if (fiber.state === 2) continue
      console.log(`  fiber ${runtime.name ?? '(anonymous)'} state=${fiber.state}${fiber._error ? ' ERROR: ' + String(fiber._error?.stack ?? fiber._error).split('\n').slice(0, 5).join(' | ') : ''}`)
    }
  }
}
const results = []
const check = (label, ok, detail) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : '  ' + detail}`) }

console.log(`runtime: ${runtime}`)
write('entry-1:', 'helper-1')
const host = await createAcrylEngineHost({
  engines: [createWebEngineDefinition(pathToFileURL(anchor).href)],
  initialEngine: 'dsh',
  prepare: hostCtx => { provideCmdline(hostCtx, { args: ['--no-open', '--port', '0'], exit: () => {} }) },
})
try {
  const services = {
    pnpm: host.ctx.get('desktopPnpm'),
    live: host.ctx.get('livePluginActivation'),
    profileDir: host.ctx.get('desktopProfiles')?.current?.dir,
  }
  if (process.env.PROBE_TRACE && services.live) { // show the real cause: the install result keeps only the message
    const activate = services.live.activate.bind(services.live)
    services.live.activate = async name => {
      // What the Loader does, by hand: import the package by its bare name from a file that lives in the profile folder.
      const probeFile = join(services.profileDir, '_probe-import.mjs')
      writeFileSync(probeFile, `export const load = () => import(${JSON.stringify(name)})\n`)
      try { const mod = await (await import(pathToFileURL(probeFile).href + '?t=' + Date.now())).load(); console.log('  manual import of', name, 'OK, exports:', Object.keys(mod).join(',')) }
      catch (error) { console.log('  manual import of', name, 'FAILED:', String(error?.stack ?? error).split('\n').slice(0, 3).join(' | ')) }
      if (process.env.PROBE_TRACE === '2') { // create the row the way the controller does, then look at what the Loader kept
        const loader = host.ctx.loader
        try {
          await loader.root.create({ id: 'probe-hot-trace', name })
          await loader.await?.()
          const created = [...loader.entries()].find(e => e.options.id === 'probe-hot-trace')
          console.log('  trace: entry', created ? 'found' : 'MISSING', '| fiber', created?.fiber === undefined ? 'undefined' : `state=${created.fiber.state}`, '| entry keys:', created ? Object.keys(created).join(',') : '-')
          try { await created?._initTask; console.log('  trace: _initTask resolved') } catch (error) { console.log('  trace: _initTask rejected:', String(error?.stack ?? error).split('\n').slice(0, 6).join(' | ')) }
          if (created?.fiber?._error) console.log('  trace: fiber error:', String(created.fiber._error?.stack ?? created.fiber._error).split('\n').slice(0, 5).join(' | '))
          for (const key of ['error', 'failure', 'reason', 'loadError']) if (created?.[key]) console.log(`  trace: entry.${key}:`, String(created[key]?.stack ?? created[key]).split('\n').slice(0, 5).join(' | '))
        } catch (error) { console.log('  trace: create threw:', String(error?.stack ?? error).split('\n').slice(0, 5).join(' | ')) }
        try { await loader.root.remove('probe-hot-trace') } catch {}
      }
      try { return await activate(name) } catch (error) { console.log('  activate threw:', String(error?.stack ?? error).split('\n').slice(0, 8).join(' | '), error?.cause ? ' CAUSE: ' + String(error.cause?.stack ?? error.cause).split('\n').slice(0, 8).join(' | ') : ''); throw error } }
  }
  check('services present (desktopPnpm, livePluginActivation, desktopProfiles)', Boolean(services.pnpm && services.live && services.profileDir))
  const first = await installLocalPlugin({ path: dir }, services)
  console.log('  install 1:', brief(first))
  if (!first.ok) problems()
  check('install 1 reports active and automatic host reload', first.ok === true && first.status === 'active' && first.hostReload === 'automatic')
  check('install 1: the plugin runs in the live process', globalThis.__probeHot === 'entry-1:helper-1', `holds ${JSON.stringify(globalThis.__probeHot)}`)
  write('entry-2:', 'helper-2')
  const second = await installLocalPlugin({ path: dir }, services)
  console.log('  install 2:', brief(second))
  check('install 2 reports updated and automatic host reload', second.ok === true && second.action === 'updated' && second.hostReload === 'automatic')
  check('install 2: BOTH the entry and the file it imports are fresh', globalThis.__probeHot === 'entry-2:helper-2', `holds ${JSON.stringify(globalThis.__probeHot)}`)
} catch (error) {
  check('no exception', false, error instanceof Error ? (error.stack ?? error.message).split('\n').slice(0, 6).join(' | ') : String(error))
} finally {
  await host.dispose().catch(() => {})
}
console.log(results.every(Boolean) && results.length > 0 ? `ALL PASS on ${runtime}` : `NOT PASSING on ${runtime}`)
process.exit(results.every(Boolean) && results.length > 0 ? 0 : 1)
