// TTY smoke for the ACRYL `/login` auth surface (Stage 1 evidence).
// Drives the built `acryl tui` under node-pty, opens `/login`, and asserts the
// provider-list overlay paints (or the profile's degraded "not available"
// notice when the settings/credentials/llm services are absent).
//
// Usage (after `corepack pnpm --filter acryl-tui run build`):
//   corepack pnpm --filter acryl-tui exec node scripts/login-pty-smoke.mjs
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pty = require('node-pty')

const packageRoot = fileURLToPath(new URL('..', import.meta.url)) // acryl-tui/
const repoRoot = fileURLToPath(new URL('../..', import.meta.url)) // acryl/
const bin = join(packageRoot, 'lib/bin.js')
const home = mkdtempSync(join(tmpdir(), 'acryl-login-smoke-'))

let out = ''
const proc = pty.spawn(process.execPath, [bin, 'tui'], {
  cwd: repoRoot,
  cols: 120,
  rows: 40,
  env: { ...process.env, DSH_HOME: home, NO_COLOR: '1' },
})
const deadline = Date.now() + 40000
const timer = setInterval(() => { if (Date.now() > deadline) proc.kill() }, 2000)

proc.onData(d => { out += d })

// Boot, open /login, wait for the overlay to paint, then exit (Ctrl+C x3).
setTimeout(() => proc.write('/login\r'), 5000)
setTimeout(() => proc.write('\x03'), 12000)
setTimeout(() => proc.write('\x03'), 12500)
setTimeout(() => proc.write('\x03'), 13000)

proc.onExit(({ exitCode }) => {
  clearInterval(timer)
  const cleaned = out.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\r/g, '\n')
  const markers = {
    banner: /acryl/i.test(cleaned),
    // The `/login` overlay's list header, or its degraded empty-state notice.
    overlay: /Model providers|provider settings are not available|Loading/i.test(cleaned),
    // The provider list paints with per-row auth status ("[no api key]").
    providerList: /Model providers/.test(cleaned),
    exited: exitCode === 0,
  }
  const evidenceDir = join(repoRoot, 'specs/024-acryl-cli-login/evidence')
  mkdirSync(evidenceDir, { recursive: true })
  const sample = cleaned.split('\n').filter(Boolean).slice(0, 60).join('\n')
  require('node:fs').writeFileSync(join(evidenceDir, 'login-pty-smoke.output.txt'), sample)
  console.log('MARKERS', JSON.stringify(markers))
  console.log('EXIT_CODE', exitCode)
  rmSync(home, { force: true, recursive: true })
  process.exit(markers.banner && markers.overlay && markers.providerList && markers.exited ? 0 : 1)
})
