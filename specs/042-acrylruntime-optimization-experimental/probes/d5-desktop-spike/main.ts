// D5 spike: a deno desktop window hosting the ACRYL web host. The payload (lib + node_modules) sits on the real disk in Resources.
import { dirname, join } from 'node:path'

const exe = Deno.execPath() // <App>.app/Contents/MacOS/<name>
const payload = Deno.env.get('ACRYL_PAYLOAD') ?? join(dirname(dirname(exe)), 'Resources', 'payload')
const log = (...a: unknown[]) => console.error('[acryl-desktop-spike]', ...a)

// serveWeb prints "ACRYL web: <authenticated url>" once the host listens; take the URL from that line.
const urlReady = new Promise<string>((resolve) => {
  const write = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((chunk: unknown, ...rest: unknown[]) => {
    const m = /ACRYL web: (http:\/\/\S+)/.exec(String(chunk))
    if (m) resolve(m[1])
    return (write as (...a: unknown[]) => boolean)(chunk, ...rest)
  }) as typeof process.stdout.write
})
const { serveWeb } = await import('file://' + join(payload, 'lib', 'index.js'))
serveWeb({}).catch((e: unknown) => { log('serveWeb failed', e); Deno.exit(1) })

const url = await urlReady
log('host ready, navigating window to', url.replace(/token=.*/, 'token=<redacted>'))
const win = new Deno.BrowserWindow()
win.navigate(url)
log('window created')

// Evidence of what actually rendered: ask the page itself. ACRYL_SPIKE_INSPECT=1 runs ACRYL_SPIKE_JS (a file of page scripts separated by a line
// of "//----") after the page settles and logs each result; ACRYL_SPIKE_HOLD_SECONDS keeps the window open afterwards (for a window-only capture).
if (Deno.env.get('ACRYL_SPIKE_INSPECT') === '1') {
  await new Promise((r) => setTimeout(r, 12000))
  const scripts = Deno.env.get('ACRYL_SPIKE_JS') ? Deno.readTextFileSync(Deno.env.get('ACRYL_SPIKE_JS')!).split(/^\/\/----$/m) : ['document.title']
  for (const [i, js] of scripts.entries()) {
    try {
      const result = await (win as unknown as { executeJs(js: string): Promise<unknown> }).executeJs(js)
      log(`PAGE[${i}]`, typeof result === 'string' ? result : JSON.stringify(result))
    } catch (e) { log(`executeJs[${i}] failed`, e) }
    await new Promise((r) => setTimeout(r, 1500))
  }
  await new Promise((r) => setTimeout(r, Number(Deno.env.get('ACRYL_SPIKE_HOLD_SECONDS') ?? '0') * 1000))
  Deno.exit(0)
}
