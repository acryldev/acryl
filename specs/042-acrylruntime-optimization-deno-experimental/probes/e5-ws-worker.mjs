// E5: ws upgrade over node:http (as the workspace pty stream does) and worker_threads + node:vm. Run with node and bun.
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { Worker } from 'node:worker_threads'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readdirSync } from 'node:fs'
const rt = typeof Deno !== 'undefined' ? `deno ${Deno.version.deno}` : typeof Bun !== 'undefined' ? `bun ${Bun.version}` : `node ${process.versions.node}`
const out = (n, r) => console.log(`${rt.padEnd(14)} | ${n.padEnd(40)} | ${r}`)
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const wsDir = readdirSync(resolve(repo, 'node_modules/.pnpm')).find(d => d.startsWith('ws@'))
const { WebSocketServer, WebSocket } = createRequire(import.meta.url)(resolve(repo, 'node_modules/.pnpm', wsDir, 'node_modules/ws'))
const port = Number(process.env.PROBE_PORT ?? 38459)
try {
  const http = createServer()
  const wss = new WebSocketServer({ noServer: true })
  http.on('upgrade', (req, sock, head) => { if (req.url === '/chan') wss.handleUpgrade(req, sock, head, w => w.on('message', m => w.send('echo:' + m))); else sock.destroy() })
  await new Promise(r => http.listen(port, '127.0.0.1', r))
  const got = await new Promise((res, rej) => { const c = new WebSocket(`ws://127.0.0.1:${port}/chan`); c.on('open', () => c.send('hi')); c.on('message', m => { res(String(m)); c.close() }); c.on('error', rej); setTimeout(() => rej(new Error('timeout')), 4000) })
  out('E5a ws noServer upgrade roundtrip', got === 'echo:hi' ? 'OK' : 'FAIL ' + got)
  http.close(); wss.close()
} catch (e) { out('E5a ws noServer upgrade roundtrip', 'FAIL (' + String(e.message).split('\n')[0] + ')') }
try {
  const w = new Worker('const {parentPort}=require("node:worker_threads");const vm=require("node:vm");parentPort.postMessage(vm.runInContext("x*2",vm.createContext({x:21})))', { eval: true })
  const v = await new Promise((res, rej) => { w.on('message', res); w.on('error', rej); setTimeout(() => rej(new Error('timeout')), 4000) })
  out('E5b worker_threads + vm.runInContext', v === 42 ? 'OK' : 'FAIL ' + v); await w.terminate()
} catch (e) { out('E5b worker_threads + vm.runInContext', 'FAIL (' + String(e.message).split('\n')[0] + ')') }
process.exit(0)
