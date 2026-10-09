// A terminal tab through the REAL web host, on whatever runtime runs this file (Node, Deno or Bun): boot the web engine host on a free port, start a shell with the
// workspace plugin's own HTTP route, attach over its WebSocket route, type a command, resize, and read the exit. Nothing is faked: the host's own web server, its
// upgrade routing, the workspace plugin, and the terminal backend that `select-spawn.ts` picks for this runtime.
//
// Throwaway homes only (see live-install.mjs for the recipe). `ACRYL_NODE_SIDECAR=$(which node)` for Deno and Bun, as there.
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
for (const name of ['HOME', 'ACRYL_HOME', 'DSH_HOME', 'WORKSPACE']) {
  if (!process.env[name]) { console.error(`set ${name} to a throwaway folder`); process.exit(2) }
}
if (process.env.ACRYL_NODE_SIDECAR) process.execPath = process.env.ACRYL_NODE_SIDECAR
const runtime = typeof Bun !== 'undefined' ? `bun ${Bun.version}` : typeof Deno === 'undefined' ? `node ${process.version}` : `deno ${Deno.version.deno}`
const anchor = resolve(repo, 'apps/acryl-web/package.json')
const require = createRequire(pathToFileURL(anchor))
const load = async specifier => import(pathToFileURL(require.resolve(specifier)).href)
const { createAcrylEngineHost, createWebEngineDefinition } = await load('acryl-harness-runtime')
const { provideCmdline } = await load('@deepseek-ai/dsh-cmdline')
// The host code imports `ws` by its bare name, and Bun answers that with its own implementation; loading the package by file path on Bun would test something the host never runs.
const wsModule = typeof Bun !== 'undefined' ? await import('ws') : await import(pathToFileURL(createRequire(pathToFileURL(resolve(repo, 'plugins/acryl-workspace/package.json'))).resolve('ws')).href)
const WebSocket = wsModule.WebSocket ?? wsModule.default

const results = []
const check = (label, ok, detail) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : '  ' + detail}`) }
const until = async (condition, ms = 8000) => { for (let i = 0; i < ms / 20; i += 1) { if (condition()) return true; await new Promise(r => setTimeout(r, 20)) } return false }

console.log(`runtime: ${runtime}`)
const host = await createAcrylEngineHost({
  engines: [createWebEngineDefinition(pathToFileURL(anchor).href)],
  initialEngine: 'dsh',
  prepare: hostCtx => { provideCmdline(hostCtx, { args: ['--no-open', '--port', '0'], exit: () => {} }) },
})
try {
  const web = host.ctx.get('acrylWeb')
  check('the web host is up and has the workspace routes', web !== undefined && Number(web.port) > 0, web === undefined ? 'no acrylWeb service' : `port ${String(web.port)}`)
  const origin = `http://127.0.0.1:${String(web.port)}`
  const started = await fetch(`${origin}/api/acryl-workspace/pty`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ commandId: 'shell', cols: 90, rows: 28 }) })
  const view = started.ok ? await started.json() : undefined
  check('POST starts a shell session', started.ok && typeof view?.id === 'string', `HTTP ${String(started.status)}`)
  const messages = []
  const ws = new WebSocket(`ws://127.0.0.1:${String(web.port)}/api/acryl-workspace/pty/stream?id=${encodeURIComponent(view.id)}&since=0`, { headers: { origin } })
  const opened = await new Promise(resolve => { ws.on('open', () => resolve(true)); ws.on('error', () => resolve(false)); setTimeout(() => resolve(false), 5000) })
  check('the WebSocket route upgrades through the host web server', opened)
  ws.on('message', raw => { messages.push(JSON.parse(raw.toString('utf8'))) })
  const text = () => messages.map(m => (m.t === 'out' ? m.data : '')).join('')
  ws.send(JSON.stringify({ t: 'in', data: 'echo e2e-$((6*7))\r' }))
  check('a typed command runs and its output comes back', await until(() => text().includes('e2e-42')))
  ws.send(JSON.stringify({ t: 'resize', cols: 111, rows: 37 }))
  ws.send(JSON.stringify({ t: 'in', data: 'stty size\r' }))
  check('a resize reaches the terminal', await until(() => text().includes('37 111')))
  ws.send(JSON.stringify({ t: 'in', data: 'exit 4\r' }))
  check('the exit code is reported', await until(() => messages.some(m => m.t === 'exit' && m.exitCode === 4)))
  ws.close()
} catch (error) {
  check('no exception', false, error instanceof Error ? (error.stack ?? error.message).split('\n').slice(0, 6).join(' | ') : String(error))
} finally {
  const stopped = Date.now()
  await host.dispose().catch(() => {})
  console.log(`host stopped in ${String(Date.now() - stopped)} ms`)
}
console.log(results.every(Boolean) && results.length > 0 ? `ALL PASS on ${runtime}` : `NOT PASSING on ${runtime}`)
process.exit(results.every(Boolean) && results.length > 0 ? 0 : 1)
