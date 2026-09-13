// TTY smoke for /market (spec 034 T006, completing CLI's own install +
// hot-reload path). Drives the built `acryl tui` under a real pseudo-terminal,
// opens /market, selects and installs the real published
// acryl-dsh-editor-plugin-cli from the live acryl.dev catalog, then - in the
// SAME running process, no restart - runs /files to prove the newly-
// installed plugin's own dynamic command became usable live.
//
// Usage (after `corepack pnpm --filter acryl-cli run build`):
//   corepack pnpm --filter acryl-cli exec node tests/tui/market-pty-smoke.mjs
// Needs real network access (a real npm install against the real registry).
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pty = require('node-pty')

const packageRoot = fileURLToPath(new URL('../..', import.meta.url)) // acryl-cli/
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url)) // acryl/
const bin = join(packageRoot, 'lib/bin.js')
const home = mkdtempSync(join(tmpdir(), 'acryl-cli-market-smoke-'))

let out = ''
const proc = pty.spawn(process.execPath, [bin, 'tui'], {
  cwd: repoRoot,
  cols: 120,
  rows: 40,
  env: { ...process.env, DSH_HOME: home, NO_COLOR: '1' },
})
const deadline = Date.now() + 90000
const timer = setInterval(() => {
  if (Date.now() > deadline) proc.kill()
}, 2000)

proc.onData(d => { out += d })

// Open /market, let the real catalog fetch settle. A first real run showed
// the live catalog order is acryl-development-canvas, then
// acryl-dsh-editor-plugin-cli - one Down arrow reaches the CLI-surface
// plugin specifically (it is the one whose install we need: it is the only
// published package that itself contributes a new dynamic TUI command,
// which is what actually proves hot-reload reached the TUI, not just the
// Loader tree). If catalog ordering ever changes this needs a real
// name-matching selector, not an assumed arrow count.
setTimeout(() => proc.write('/market\r'), 3500)
setTimeout(() => proc.write('\x1b[B'), 7500) // Down: move off acryl-development-canvas onto acryl-dsh-editor-plugin-cli
setTimeout(() => proc.write('\r'), 8000) // install the highlighted item
setTimeout(() => proc.write('\x1b'), 40000) // esc: close /market once install settles
setTimeout(() => proc.write('/files\r'), 42000)
setTimeout(() => proc.write('\x1b'), 45000) // esc: close /files
setTimeout(() => proc.write('\x03'), 47000)
setTimeout(() => proc.write('\x03'), 47500)

proc.onExit(({ exitCode }) => {
  clearInterval(timer)
  const cleaned = out.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\r/g, '\n')
  const markers = {
    marketOpened: /ACRYL Package Catalog/.test(cleaned),
    catalogLoaded: /acryl-dsh-editor-plugin/.test(cleaned),
    installStarted: /Installing/.test(cleaned),
    installedLive: /Installed and activated/.test(cleaned),
    filesOpened: /acryl-dsh-editor-plugin-cli/.test(cleaned) && /esc close|Browse and view/i.test(cleaned),
    exited: exitCode === 0,
  }
  const sample = cleaned.split('\n').filter(Boolean).slice(-80).join('\n')
  require('node:fs').writeFileSync(join(repoRoot, 'specs/034-plugins-on-every-surface/evidence/market-pty-smoke.output.txt'), sample)
  console.log('MARKERS', JSON.stringify(markers))
  console.log('EXIT_CODE', exitCode)
  rmSync(home, { force: true, recursive: true })
  process.exit(Object.values(markers).every(Boolean) ? 0 : 1)
})
