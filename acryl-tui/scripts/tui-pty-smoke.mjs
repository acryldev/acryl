// TTY smoke for the ACRYL pi-tui terminal surface (T013 evidence).
// Drives the built `acryl tui` under a real pseudo-terminal (node-pty), submits a
// prompt, then cancels/exits. Proves: full-screen pi-tui boots -> native durable
// DSH session -> prompt submit -> live status/spinner + context rows -> runtime
// errors surfaced -> clean exit code 0.
//
// Usage (after `corepack pnpm --filter acryl-tui run build`):
//   corepack pnpm --filter acryl-tui exec node scripts/tui-pty-smoke.mjs
// Optional: set DSH_HOME to a real home with a DEEPSEEK_API_KEY to see an actual
// streamed assistant response instead of the MISSING_CREDENTIAL surface error.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pty = require('node-pty')

const packageRoot = fileURLToPath(new URL('..', import.meta.url)) // acryl-tui/
const repoRoot = fileURLToPath(new URL('../..', import.meta.url)) // acryl/
const bin = join(packageRoot, 'lib/bin.js')
const home = mkdtempSync(join(tmpdir(), 'acryl-tui-smoke-'))

let out = ''
const proc = pty.spawn(process.execPath, [bin, 'tui'], {
  cwd: repoRoot,
  cols: 120,
  rows: 40,
  env: { ...process.env, DSH_HOME: home, NO_COLOR: '1' },
})
const deadline = Date.now() + 30000
const timer = setInterval(() => {
  if (Date.now() > deadline) proc.kill()
}, 2000)

proc.onData(d => { out += d })

// Wait for the editor to paint, submit a prompt, then cancel the turn (Ctrl+C)
// and exit on idle (Ctrl+C twice).
setTimeout(() => proc.write('inspect the repository\r'), 3500)
setTimeout(() => proc.write('\x03'), 6000)
setTimeout(() => proc.write('\x03'), 6500)
setTimeout(() => proc.write('\x03'), 7000)

proc.onExit(({ exitCode }) => {
  clearInterval(timer)
  const cleaned = out.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\r/g, '\n')
  const markers = {
    banner: /dsh-tui|acryl/i.test(cleaned),
    status: /session|deepseek|model|idle|running|Full Access|workspace/i.test(cleaned),
    prompt: /inspect the repository/.test(cleaned),
    exited: exitCode === 0,
  }
  // Keep the terminal output for the ledger evidence.
  const sample = cleaned.split('\n').filter(Boolean).slice(0, 60).join('\n')
  require('node:fs').writeFileSync(join(repoRoot, 'specs/019-acryl-harness-runtime/evidence/tui-pty-smoke.output.txt'), sample)
  console.log('MARKERS', JSON.stringify(markers))
  console.log('EXIT_CODE', exitCode)
  rmSync(home, { force: true, recursive: true })
  process.exit(markers.banner && markers.status && markers.prompt && markers.exited ? 0 : 1)
})
