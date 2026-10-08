// D3: native modules ACRYL depends on - each does one real operation, not just a load.
// Run with: node <this file> and deno run -A --node-modules-dir=manual <this file>. Starts no servers, touches no ACRYL home.
import { createRequire } from 'node:module'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readdirSync } from 'node:fs'

const rt = typeof Deno !== 'undefined' ? `deno ${Deno.version.deno}` : `node ${process.versions.node}`
const out = (name, result) => console.log(`${rt.padEnd(14)} | ${name.padEnd(44)} | ${result}`)
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const pnpm = resolve(repo, 'node_modules/.pnpm')
const find = (prefix, sub) => resolve(pnpm, readdirSync(pnpm).find(d => d.startsWith(prefix)), 'node_modules', sub)
const timed = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout ${ms}ms`)), ms))])
const run = async (name, fn) => {
  try { out(name, await timed(fn(), 8000)) } catch (e) { out(name, `FAIL (${String(e.message).split('\n')[0]})`) }
}
const req = createRequire(import.meta.url)

// N1: koffi calls into libc (strlen) through its FFI
await run('N1 koffi call libc strlen', async () => {
  const koffi = req(find('koffi@', 'koffi'))
  const lib = koffi.load(process.platform === 'darwin' ? '/usr/lib/libSystem.B.dylib' : 'libc.so.6')
  const strlen = lib.func('size_t strlen(const char *s)')
  const n = Number(strlen('hello'))
  return n === 5 ? 'OK' : `FAIL (got ${n})`
})

// N2: sharp resizes a generated image to PNG and reads the result back
await run('N2 sharp create+resize+png', async () => {
  const sharp = req(find('sharp@', 'sharp'))
  const buf = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#336699' } }).resize(16, 16).png().toBuffer()
  const meta = await sharp(buf).metadata()
  return meta.width === 16 && meta.format === 'png' ? 'OK' : `FAIL (${meta.width}x${meta.height} ${meta.format})`
})

// N3: sherpa-onnx-node loads its native binding (full recognition needs model files, not shipped here)
await run('N3 sherpa-onnx-node load native binding', async () => {
  const sherpa = req(find('sherpa-onnx-node@', 'sherpa-onnx-node'))
  return typeof sherpa === 'object' && Object.keys(sherpa).length > 0 ? `OK (${Object.keys(sherpa).length} exports)` : 'FAIL (empty exports)'
})

// N4: @xterm/headless parses terminal output into a buffer (used for terminal snapshots)
await run('N4 @xterm/headless write+read buffer', async () => {
  const dir = readdirSync(pnpm).filter(d => d.startsWith('@xterm+headless@')).sort().pop()
  const { Terminal } = req(resolve(pnpm, dir, 'node_modules/@xterm/headless'))
  const term = new Terminal({ cols: 40, rows: 5, allowProposedApi: true })
  await new Promise(r => term.write('hello \x1b[31mred\x1b[0m world', r))
  const line = term.buffer.active.getLine(0)?.translateToString(true)
  return line === 'hello red world' ? 'OK' : `FAIL (${JSON.stringify(line)})`
})
process.exit(0)
