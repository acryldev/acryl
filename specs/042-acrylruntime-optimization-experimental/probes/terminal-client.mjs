// A black-box client for a RUNNING ACRYL web host: the terminal tab as a browser would use it. Start a shell with the workspace route, attach over the WebSocket route, type, resize, read the
// exit. Run with Node against any host URL (the line "ACRYL web: <url>" the host prints), for example a packaged build:
//   node terminal-client.mjs "http://127.0.0.1:<port>/?token=..." <payload dir holding node_modules/ws>
// Loopback only: the host binds 127.0.0.1 and checks the Origin header against its own address.
import { createRequire } from 'node:module'
import { join } from 'node:path'
const [url, payload] = process.argv.slice(2)
if (!url || !payload) { console.error('usage: terminal-client.mjs <host url> <payload dir>'); process.exit(2) }
const { WebSocket } = createRequire(join(payload, 'package.json'))('ws')
const origin = new URL(url).origin
const port = new URL(url).port
const results = []
const check = (label, ok, detail) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : '  ' + detail}`) }
const until = async (condition, ms = 8000) => { for (let i = 0; i < ms / 20; i += 1) { if (condition()) return true; await new Promise(r => setTimeout(r, 20)) } return false }
const started = await fetch(`${origin}/api/acryl-workspace/pty`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ commandId: 'shell', cols: 90, rows: 28 }) })
const view = started.ok ? await started.json() : undefined
check('POST starts a shell session', started.ok && typeof view?.id === 'string', `HTTP ${String(started.status)}`)
const messages = []
const ws = new WebSocket(`ws://127.0.0.1:${port}/api/acryl-workspace/pty/stream?id=${encodeURIComponent(view?.id ?? '')}&since=0`, { headers: { origin } })
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
console.log(results.every(Boolean) ? 'ALL PASS' : 'NOT PASSING')
process.exit(results.every(Boolean) ? 0 : 1)
