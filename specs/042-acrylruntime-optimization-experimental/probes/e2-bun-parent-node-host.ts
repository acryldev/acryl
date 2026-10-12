// E2 (Option A shape): a Bun parent starts the unchanged Node host with a temporary home and a spare port, checks it serves, stops it.
// Run: bun e2-bun-parent-node-host.ts   (needs apps/acryl-web built: lib/bin.js)
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
const root = resolve(import.meta.dir, '../../..')
const port = process.env.PROBE_PORT ?? '38457'
const home = mkdtempSync(join(tmpdir(), 'acryl-e2-'))
const child = Bun.spawn(['node', '--expose-internals', join(root, 'apps/acryl-web/lib/bin.js')], {
  env: { ...process.env, ACRYL_HOME: home, ACRYL_WEB_PORT: port }, stdout: 'pipe', stderr: 'pipe', cwd: root,
})
let url: string | undefined
let log = ''
const dec = new TextDecoder()
const pump = async (s: ReadableStream<Uint8Array>) => { for await (const c of s) { const t = dec.decode(c); log += t; const m = t.match(/ACRYL web: (\S+)/); if (m) url = m[1] } }
void pump(child.stdout); void pump(child.stderr)
const t0 = Date.now()
while (!url && child.exitCode === null && Date.now() - t0 < 150000) await Bun.sleep(500)
if (!url) { console.log('E2 FAIL: no URL. log tail:\n' + log.slice(-1200)); child.kill('SIGTERM'); process.exit(1) }
console.log(`E2 host up in ${Math.round((Date.now() - t0) / 1000)}s`)
const base = url.split('?')[0]
console.log('GET / without token ->', (await fetch(base)).status)
const r1 = await fetch(url, { redirect: 'manual' })
const cookie = (r1.headers.get('set-cookie') ?? '').split(';')[0]
console.log('GET /?token ->', r1.status, 'cookie set:', cookie !== '')
const html = await (await fetch(base, { headers: { cookie } })).text()
console.log('GET / with cookie -> html bytes', html.length, '| script tags', (html.match(/<script/g) ?? []).length)
child.kill('SIGTERM')
const code = await Promise.race([child.exited, Bun.sleep(8000).then(() => 'timeout')])
console.log('shutdown:', code)
if (code === 'timeout') child.kill('SIGKILL')
process.exit(0)
