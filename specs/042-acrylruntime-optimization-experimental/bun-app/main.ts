// AcrylBun: the ACRYL web host running in-process on Bun, compiled with `bun build --compile` (the route Pi's standalone binaries take). Experimental build of spec 042.
// Compiled, this file is the whole executable; the payload (lib/ + node_modules + a Node sidecar) is on the real disk beside it, not embedded, because ACRYL links installed
// packages into its profile and the Cordis Loader imports plugins by name at run time.
//   <dir>/acryl-bun            this executable
//   <dir>/payload/             make-payload.sh output (../deno-app/make-payload.sh <os> <arch> <dir>/payload)
import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const NAME = 'AcrylBun'
const exe = process.execPath
const payload = process.env.ACRYL_PAYLOAD ?? join(dirname(exe), 'payload')

// Its own data folder, so a run of this build can never read or write the real ACRYL (~/.acryl, ~/.dsh) or a running ACRYL app's profile.
const userHome = process.env.HOME ?? process.env.USERPROFILE ?? '.'
const acrylHome = process.env.ACRYL_HOME ?? join(userHome, '.acrylbun')
process.env.ACRYL_HOME = acrylHome
mkdirSync(join(acrylHome, 'logs'), { recursive: true })
const logFile = join(acrylHome, 'logs', 'acrylbun.log')
const log = (...parts: unknown[]) => {
  const line = `${new Date().toISOString()} ${parts.map(part => (typeof part === 'string' ? part : JSON.stringify(part))).join(' ')}\n`
  try { appendFileSync(logFile, line) } catch { /* the log is a convenience */ }
  console.error(`[${NAME}]`, ...parts)
}
const bun = (globalThis as { Bun?: { version: string } }).Bun
log(`starting; home=${acrylHome} payload=${payload} os=${process.platform}-${process.arch} bun=${bun?.version ?? 'none'}`)

// The Harness starts child processes as "node" through `process.execPath` (the package manager behind `dsh plugin add`, MCP servers, the subprocess runner). In a compiled
// Bun executable that is this executable, which cannot run a script, and Bun cannot run the Harness's `dsh` CLI (it needs node:sqlite). The payload ships a real Node.
const nodeSidecar = join(payload, 'runtime', process.platform === 'win32' ? 'node.exe' : 'node')
if (existsSync(nodeSidecar)) {
  process.execPath = nodeSidecar
  log('child processes run on the bundled Node:', nodeSidecar)
} else {
  log('no bundled Node at', nodeSidecar, '- installing plugins and anything else that starts "node" will not work')
}

try {
  // Diagnostics, off unless ACRYLBUN_DEBUG_SCRIPT=<path to a .mjs>: run that script inside THIS process (the compiled runtime, the bundled Node as process.execPath) instead of the
  // app; the script ends the process itself. How probes/live-install.mjs and probes/terminal-e2e.mjs run against the compiled build (with PAYLOAD=<payload dir> for the first).
  const debugScript = process.env.ACRYLBUN_DEBUG_SCRIPT
  if (debugScript !== undefined && debugScript !== '') {
    log('debug script:', debugScript)
    await import(pathToFileURL(debugScript).href)
    process.exit(0)
  }
  log('importing the ACRYL payload')
  const { serveWeb } = await import(pathToFileURL(join(payload, 'lib', 'index.js')).href)
  log('payload imported; starting the host')
  // Port 0: a free loopback port, never ACRYL's 3080. ACRYLBUN_ARGS adds or replaces command-line arguments (space separated).
  const args = (process.env.ACRYLBUN_ARGS ?? '--no-open --port 0').split(' ').filter(Boolean)
  await serveWeb({ cmdlineArgs: args })
} catch (error) {
  log('startup failed', String((error as Error)?.stack ?? error))
  process.exit(1)
}
