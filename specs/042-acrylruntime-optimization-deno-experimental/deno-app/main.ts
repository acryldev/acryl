// AcrylDeno: the ACRYL web host running in-process on Deno, shown in a `deno desktop` window. Experimental build of spec 042.
// The payload (lib/ + node_modules) is on the real disk beside the app, not embedded: ACRYL symlinks installed packages into its profile.
import { dirname, join } from 'node:path'
import { appendFileSync, mkdirSync } from 'node:fs'

const NAME = 'AcrylDeno'
const exe = Deno.execPath()
// macOS: <App>.app/Contents/MacOS/<exe> -> ../Resources/payload; Linux (.deb): <dir>/<exe> -> <dir>/payload
const payload = Deno.env.get('ACRYL_PAYLOAD') ?? (Deno.build.os === 'darwin' ? join(dirname(dirname(exe)), 'Resources', 'payload') : join(dirname(exe), 'payload'))

// Its own data folder, so a test of this build can never read or write the real ACRYL (~/.acryl, ~/.dsh) or a running ACRYL app's profile.
const userHome = Deno.env.get('HOME') ?? '.'
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
log(`starting; home=${acrylHome} payload=${payload} os=${Deno.build.os}-${Deno.build.arch} deno=${Deno.version.deno}`)

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

const win = new Deno.BrowserWindow()
try { win.setTitle(NAME); win.setSize(1280, 860); win.navigate(startingPage) } catch (e) { log('window setup', String(e)) }

let stopping = false
const shutdown = async (why: string) => {
  if (stopping) return
  stopping = true
  log('shutdown:', why)
  process.emit('SIGTERM') // serveWeb disposes the host (servers, terminals) on SIGTERM
  await new Promise((r) => setTimeout(r, 2500))
  Deno.exit(0)
}
win.addEventListener('close', () => { void shutdown('window closed') })
Deno.addSignalListener('SIGTERM', () => { void shutdown('SIGTERM') })
Deno.addSignalListener('SIGINT', () => { void shutdown('SIGINT') })

try {
  const { serveWeb } = await import('file://' + join(payload, 'lib', 'index.js'))
  serveWeb({}).catch((e: unknown) => {
    const message = String((e as Error)?.stack ?? e)
    log('serveWeb failed', message)
    win.navigate(errorPage(message))
  })
  const url = await Promise.race([hostUrl, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('the ACRYL host did not report a URL within 90 s')), 90_000))])
  log('host ready on', url.replace(/token=.*/, 'token=<redacted>'))
  win.navigate(url)
  // The client sets its own page title ("ACRYL"), which becomes the window title; keep this build recognizable while it is under test.
  const keepTitle = `(() => { const t = document.title.replace(/^${NAME}( - )?/, '').trim(); const want = t === '' || t === 'ACRYL' ? '${NAME}' : '${NAME} - ' + t; if (document.title !== want) document.title = want })()`
  setInterval(() => { void (win as unknown as { executeJs(js: string): Promise<unknown> }).executeJs(keepTitle).catch(() => {}) }, 3000)
} catch (e) {
  const message = String((e as Error)?.stack ?? e)
  log('startup failed', message)
  win.navigate(errorPage(message))
}

// Diagnostics, off unless ACRYLDENO_DEBUG_JS names a file: its page scripts (separated by a line of "//----") run in the window once the client has loaded and
// each result is written to the log. Used to test the packaged app without a human at the keyboard.
const debugScripts = Deno.env.get('ACRYLDENO_DEBUG_JS')
if (debugScripts) {
  await new Promise((r) => setTimeout(r, 14_000))
  for (const [i, js] of Deno.readTextFileSync(debugScripts).split(/^\/\/----$/m).entries()) {
    try { log(`debug[${i}]`, await (win as unknown as { executeJs(js: string): Promise<unknown> }).executeJs(js)) } catch (e) { log(`debug[${i}] failed`, String(e)) }
    await new Promise((r) => setTimeout(r, 1500))
  }
  await new Promise((r) => setTimeout(r, Number(Deno.env.get('ACRYLDENO_DEBUG_HOLD_SECONDS') ?? '0') * 1000))
  if (Deno.env.get('ACRYLDENO_DEBUG_QUIT') === '1') await shutdown('debug run finished')
}
