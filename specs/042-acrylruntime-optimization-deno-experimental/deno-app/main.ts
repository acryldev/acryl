// AcrylDeno: the ACRYL web host running in-process on Deno, shown in a `deno desktop` window. Experimental build of spec 042.
// The payload (lib/ + node_modules) is on the real disk beside the app, not embedded: ACRYL symlinks installed packages into its profile.
import { dirname, join } from 'node:path'
import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const NAME = 'AcrylDeno'
const exe = Deno.execPath()
// macOS: <App>.app/Contents/MacOS/<exe> -> ../Resources/payload; Linux (.deb) and Windows: <dir>/<exe> -> <dir>/payload
const payload = Deno.env.get('ACRYL_PAYLOAD') ?? (Deno.build.os === 'darwin' ? join(dirname(dirname(exe)), 'Resources', 'payload') : join(dirname(exe), 'payload'))

// Its own data folder, so a test of this build can never read or write the real ACRYL (~/.acryl, ~/.dsh) or a running ACRYL app's profile.
const userHome = Deno.env.get('HOME') ?? Deno.env.get('USERPROFILE') ?? '.' // Windows has USERPROFILE, not HOME
const acrylHome = Deno.env.get('ACRYL_HOME') ?? join(userHome, '.acryldeno')
Deno.env.set('ACRYL_HOME', acrylHome)
// No port setting: under `deno desktop` the host binds the address the runtime hands out (DENO_SERVE_ADDRESS, a free loopback port), so ACRYL's 3080 is never contended.
mkdirSync(join(acrylHome, 'logs'), { recursive: true })
const logFile = join(acrylHome, 'logs', 'acryldeno.log')
const log = (...parts: unknown[]) => {
  const line = `${new Date().toISOString()} ${parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ')}\n`
  try { appendFileSync(logFile, line) } catch { /* the log is a convenience */ }
  console.error(`[${NAME}]`, ...parts)
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
log(`starting; home=${acrylHome} payload=${payload} os=${Deno.build.os}-${Deno.build.arch} deno=${Deno.version.deno}`)

// The Harness starts child processes as "node" through `process.execPath` (the package manager behind `dsh plugin add`, MCP servers, the subprocess runner, office
// skills). Here that is this GUI executable, which cannot run a script, and Deno itself cannot run pnpm (it fails at startup inside a bundled dependency). The payload
// ships a real Node beside the app (runtime/node, made by make-payload.sh) and `process.execPath` points at it for the whole process (specs/042 F14).
const nodeSidecar = join(payload, 'runtime', Deno.build.os === 'windows' ? 'node.exe' : 'node')
if (existsSync(nodeSidecar)) {
  process.execPath = nodeSidecar
  log('child processes run on the bundled Node:', nodeSidecar)
} else {
  log('no bundled Node at', nodeSidecar, '- installing plugins and anything else that starts "node" will not work')
}

// Native Node-API addons (`.node` files): log each one just before it loads (Deno loads them through Module._extensions['.node'] and process.dlopen), and on Windows
// REFUSE them with an ordinary error. Inside a `deno desktop` process on Windows, loading any such addon ends the whole process with an uncatchable 0xC06D007F
// (specs/042 F13: the addons look for their Node-API functions in the small exe, and the runtime that holds them is a separate DLL). A thrown error is something
// the caller can handle: the one plugin that wanted the addon fails (or falls back) and the rest of the app keeps running, instead of the process dying.
type Loader = (...args: unknown[]) => unknown
const refuseNativeAddons = Deno.build.os === 'windows'
const refusal = (file: string) => new Error(`native Node-API addons cannot be loaded inside a deno desktop process on Windows (${file})`)
const nodeModule = createRequire(import.meta.url)('node:module') as { _extensions?: Record<string, Loader> }
const extensionLoader = nodeModule._extensions?.['.node']
if (nodeModule._extensions !== undefined && typeof extensionLoader === 'function') {
  nodeModule._extensions['.node'] = function (this: unknown, ...args: unknown[]) {
    log(refuseNativeAddons ? 'refusing native addon:' : 'loading native addon:', String(args[1]))
    if (refuseNativeAddons) throw refusal(String(args[1]))
    return extensionLoader.apply(this, args)
  }
}
const processDlopen = (process as unknown as { dlopen?: Loader }).dlopen
if (typeof processDlopen === 'function') {
  ;(process as unknown as { dlopen: Loader }).dlopen = (...args: unknown[]) => {
    log(refuseNativeAddons ? 'refusing native addon (process.dlopen):' : 'loading native addon (process.dlopen):', String(args[1]))
    if (refuseNativeAddons) throw refusal(String(args[1]))
    return processDlopen.apply(process, args)
  }
}

// Pages the window shows before the host is up and if it cannot start, as data: URLs: no server of ours may take the address the desktop runtime hands out,
// because ACRYL's own web server binds it (Deno's node:http honours DENO_SERVE_ADDRESS) and that is the content the window is meant to show.
const dataPage = (html: string) => 'data:text/html;charset=utf-8;base64,' + btoa(unescape(encodeURIComponent(`<!doctype html><meta charset=utf-8><title>${NAME}</title><body style="font:15px system-ui;margin:12vh auto;max-width:36em;color:#222">${html}`)))
const escapeHtml = (text: string) => text.replace(/[<&>]/g, (c) => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'))
const startingPage = dataPage(`<h2>Starting ${NAME}...</h2><p>First start can take a few seconds.</p>`)
const errorPage = (message: string) => dataPage(`<h2>${NAME} could not start</h2><pre style="white-space:pre-wrap">${escapeHtml(message)}</pre><p>Log: ${escapeHtml(logFile)}</p>`)

// The host announces "ACRYL web: <url>" (serveWeb, through process.stdout, and only with a token once it is really up) and "dsh web: <url>" (through console).
// Take the first URL that carries the launch token from either path: an earlier line holds a placeholder port without one.
const hostUrl = new Promise<string>((resolve) => {
  const seen = (chunk: unknown) => {
    const m = /(?:ACRYL web|dsh web): (http:\/\/127\.0\.0\.1:\d+\/\?token=\S+)/.exec(String(chunk))
    if (m) resolve(m[1] as string)
  }
  const write = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((chunk: unknown, ...rest: unknown[]) => { seen(chunk); return (write as (...a: unknown[]) => boolean)(chunk, ...rest) }) as typeof process.stdout.write
  for (const method of ['log', 'info', 'error', 'warn'] as const) {
    const original = console[method].bind(console)
    console[method] = (...args: unknown[]) => { seen(args.map(String).join(' ')); original(...args) }
  }
})

type Executable = { executeJs(js: string): Promise<unknown> }
const win = new Deno.BrowserWindow()
log('window created')
try { win.setTitle(NAME); win.setSize(1280, 860); win.navigate(startingPage) } catch (e) { log('window setup', String(e)) }
if (Deno.env.get('ACRYLDENO_DEBUG_HIDE') === '1') win.hide() // debug runs on a machine someone is using: keep the window off their screen

// deno desktop navigates the window to the host's root address as soon as the server listens, before the launch token is known, and the host answers that
// with an "authentication required" page. Until the tokened URL is in hand, any load of a host page puts the loading screen back instead.
let tokenKnown = false
void hostUrl.then(() => { tokenKnown = true })
win.addEventListener('load', async () => {
  try {
    // executeJs answers { ok, value } (value is the script's result), not the bare value.
    const answer = await (win as unknown as Executable).executeJs('location.href') as { value?: unknown } | string
    const href = String(typeof answer === 'object' && answer !== null ? answer.value : answer)
    log('page loaded:', href.startsWith('data:') ? 'data: (loading/error page)' : href.replace(/token=.*/, 'token=<redacted>'))
    if (!tokenKnown && href.startsWith('http://127.0.0.1:')) { log('host root reached before the token was known; showing the loading screen'); win.navigate(startingPage) }
  } catch { /* the window may be closing */ }
})

let stopping = false
const shutdown = async (why: string) => {
  if (stopping) return
  stopping = true
  log('shutdown:', why)
  process.emit('SIGTERM') // serveWeb disposes the host (servers, terminals) on SIGTERM
  await sleep(2500)
  Deno.exit(0)
}
win.addEventListener('close', () => { void shutdown('window closed') })
log('window listeners installed')
// Windows supports only SIGINT and SIGBREAK; the others throw there.
for (const signal of ['SIGTERM', 'SIGINT', 'SIGBREAK'] as const) { try { Deno.addSignalListener(signal, () => { void shutdown(signal) }) } catch { /* not available on this OS */ } }

// Diagnostics, off unless ACRYLDENO_DEBUG_FIBERS=1: boot the host the way specs/042/probes/d1b-diagnose-fibers.mjs does, inside THIS process, and write every plugin
// fiber that is not active (with its error) to the log. A failed fiber never rejects the host's boot, so without this a host that cannot start looks like a hang.
async function dumpFibers(): Promise<void> {
  const require = createRequire(pathToFileURL(join(payload, 'package.json')).href)
  const { createAcrylEngineHost, createWebEngineDefinition } = await import(pathToFileURL(require.resolve('acryl-harness-runtime')).href)
  const { provideCmdline } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-cmdline')).href)
  const host = await createAcrylEngineHost({
    engines: [createWebEngineDefinition(pathToFileURL(join(payload, 'package.json')).href)],
    initialEngine: 'dsh',
    prepare: (c: unknown) => provideCmdline(c, { args: [], exit: () => {} }),
  })
  log('debug fibers: host object created; waiting 10 s for plugins to settle')
  await sleep(10_000)
  const ctx = host.ctx as { registry: { entries(): Iterable<[unknown, { name?: string; fibers: Iterable<{ state: number; inject?: Record<string, unknown>; _error?: unknown }> }]> }; get(name: string): unknown }
  let total = 0
  let active = 0
  for (const [, runtime] of ctx.registry.entries()) {
    for (const fiber of runtime.fibers) {
      total++
      if (fiber.state === 2) { active++; continue }
      const detail = fiber.state === 3 ? ` ERROR ${String((fiber._error as Error | undefined)?.stack ?? fiber._error).split('\n').slice(0, 4).join(' | ')}` : ` waiting for [${Object.keys(fiber.inject ?? {}).join(',')}]`
      log(`debug fibers: ${runtime.name ?? '(anonymous)'} state=${fiber.state}${detail}`)
    }
  }
  log(`debug fibers: ${active} of ${total} active; services:`, Object.fromEntries(['webServer', 'webStartup', 'connection'].map((n) => [n, ctx.get(n) !== undefined])))
}

try {
  // Diagnostics, off unless ACRYLDENO_DEBUG_SCRIPT=<path to a .mjs>: run that script inside THIS process (the real desktop runtime, the bundled Node as
  // process.execPath) instead of the app; the script ends the process itself. How the live-install probe is run against the packaged app.
  const debugScript = Deno.env.get('ACRYLDENO_DEBUG_SCRIPT')
  if (debugScript !== undefined && debugScript !== '') {
    log('debug script:', debugScript)
    await import(pathToFileURL(debugScript).href)
    await shutdown('debug script finished')
  }
  if (Deno.env.get('ACRYLDENO_DEBUG_FIBERS') === '1') {
    await dumpFibers()
    await shutdown('debug fibers finished')
  }
  log('importing the ACRYL payload')
  const { serveWeb } = await import(pathToFileURL(join(payload, 'lib', 'index.js')).href) // not 'file://' + path: that is malformed on Windows
  log('payload imported; starting the host')
  serveWeb({}).catch((e: unknown) => {
    const message = String((e as Error)?.stack ?? e)
    log('serveWeb failed', message)
    win.navigate(errorPage(message))
  })
  const url = await Promise.race([hostUrl, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`the ACRYL host did not report a URL within 90 s (see ${logFile})`)), 90_000))])
  log('host ready on', url.replace(/token=.*/, 'token=<redacted>'))
  win.navigate(url)
  // The client sets its own page title ("ACRYL"), which becomes the window title; keep this build recognizable while it is under test.
  const keepTitle = `(() => { const t = document.title.replace(/^${NAME}( - )?/, '').trim(); const want = t === '' || t === 'ACRYL' ? '${NAME}' : '${NAME} - ' + t; if (document.title !== want) document.title = want })()`
  setInterval(() => { void (win as unknown as Executable).executeJs(keepTitle).catch(() => {}) }, 3000)
} catch (e) {
  const message = String((e as Error)?.stack ?? e)
  log('startup failed', message)
  win.navigate(errorPage(message))
}

// Diagnostics, off unless ACRYLDENO_DEBUG_JS names a file: its page scripts (separated by a line of "//----") run in the window once the client has loaded and
// each result is written to the log. Used to test the packaged app without a human at the keyboard.
const debugScripts = Deno.env.get('ACRYLDENO_DEBUG_JS')
if (debugScripts) {
  await sleep(14_000)
  for (const [i, js] of Deno.readTextFileSync(debugScripts).split(/^\/\/----$/m).entries()) {
    try { log(`debug[${i}]`, await (win as unknown as Executable).executeJs(js)) } catch (e) { log(`debug[${i}] failed`, String(e)) }
    await sleep(1500)
  }
  await sleep(Number(Deno.env.get('ACRYLDENO_DEBUG_HOLD_SECONDS') ?? '0') * 1000)
  if (Deno.env.get('ACRYLDENO_DEBUG_QUIT') === '1') await shutdown('debug run finished')
}
