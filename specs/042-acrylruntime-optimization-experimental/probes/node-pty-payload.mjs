// D3 on a payload: does node-pty (the copy inside a d6-payload.mjs output) deliver data and exit under this runtime? Run with PAYLOAD set.
// node|deno run -A [--node-modules-dir=manual] node-pty-payload.mjs      (Windows runs `cmd /c echo`, others `/bin/sh -c echo`; starts one short-lived process)
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
const rt = typeof Deno !== 'undefined' ? `deno ${Deno.version.deno}` : `node ${process.versions.node}`
const payload = process.env.PAYLOAD
if (!payload) { console.error('set PAYLOAD'); process.exit(2) }
const events = []
let out = ''
try {
  const pty = createRequire(import.meta.url)(resolve(payload, 'node_modules/node-pty'))
  const win = process.platform === 'win32'
  const p = pty.spawn(win ? 'cmd.exe' : '/bin/sh', win ? ['/c', 'echo hello-from-pty'] : ['-c', 'echo hello-from-pty'], { name: 'xterm', cols: 80, rows: 24, env: process.env })
  p.onData((d) => { events.push('data'); out += d })
  p.onExit((e) => { events.push('exit:' + e.exitCode) })
  await new Promise((r) => setTimeout(r, 4000))
  console.log(`${rt.padEnd(14)} | node-pty ${process.platform} | ${events.includes('data') && events.some((e) => e.startsWith('exit')) ? 'OK' : 'FAIL'} events=${JSON.stringify(events)} output=${JSON.stringify(out.trim().slice(0, 60))}`)
} catch (e) { console.log(`${rt.padEnd(14)} | node-pty ${process.platform} | FAIL (${String(e.message).split('\n')[0]})`) }
process.exit(0)
