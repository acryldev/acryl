// D2: the real Cordis Loader's run-time lifecycle - create, disable, re-enable, config change, remove, and reload after the plugin file is edited.
// Run: node|deno run -A [--node-modules-dir=manual] loader-lifecycle.mjs   (writes only to a temp dir; starts no servers)
import { createRequire } from 'node:module'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const rt = typeof Deno !== 'undefined' ? `deno ${Deno.version.deno}` : `node ${process.versions.node}`
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const req = createRequire(join(repo, 'runtime/acryl-harness-runtime/package.json'))
const { Context } = await import(pathToFileURL(req.resolve('@deepseek-ai/cordis')).href)
const { Loader } = await import(pathToFileURL(req.resolve('@deepseek-ai/cordis-plugin-loader')).href)
const out = (n, r) => console.log(`${rt.padEnd(12)} | ${n.padEnd(46)} | ${r}`)
const dir = mkdtempSync(join(tmpdir(), 'd2-loader-'))
const events = []
globalThis.__d2 = events
const pluginSource = (version) => `export const name = 'probe-plugin'
export function apply(ctx, config) {
  globalThis.__d2.push('apply v${version} ' + JSON.stringify(config))
  ctx.effect(() => () => { globalThis.__d2.push('dispose v${version}') })
}
`
const file = join(dir, 'probe-plugin.mjs')
writeFileSync(file, pluginSource(1))
const last = () => events.splice(0).join(' ; ')
const check = async (label, expected, act) => {
  try { await act(); await root.loader.await(); const got = last(); out(label, got === expected ? 'OK' : `FAIL (got: ${got || '(nothing)'}; want: ${expected})`) }
  catch (e) { out(label, `FAIL (${String(e.message).split('\n')[0]})`) }
}
const root = new Context()
await root.plugin(Loader, { baseUrl: pathToFileURL(dir + '/').href })
let id
await check('create starts the plugin', 'apply v1 {"a":1}', async () => { id = await root.loader.create({ name: pathToFileURL(file).href, config: { a: 1 } }) })
await check('disabled: true stops it', 'dispose v1', () => root.loader.update(id, { name: pathToFileURL(file).href, config: { a: 1 }, disabled: true }))
await check('disabled: false starts it again', 'apply v1 {"a":1}', () => root.loader.update(id, { name: pathToFileURL(file).href, config: { a: 1 }, disabled: false }))
await check('config change restarts with new config', 'dispose v1 ; apply v1 {"a":2}', () => root.loader.update(id, { name: pathToFileURL(file).href, config: { a: 2 }, disabled: false }))
// Editing the file does nothing by itself (no file watcher: that is cordis-plugin-hmr, which needs Node internals). A reload is explicit.
writeFileSync(file, pluginSource(2))
await check('edited file, explicit remove + create = v2', 'dispose v1 ; apply v2 {"a":2}', async () => {
  root.loader.remove(id); await root.loader.await()
  id = await root.loader.create({ name: pathToFileURL(file).href + '?v=2', config: { a: 2 } })
})
await check('remove stops it', 'dispose v2', async () => { root.loader.remove(id) })
await root.lifecycle?.stop?.()
rmSync(dir, { recursive: true, force: true })
process.exit(0)
