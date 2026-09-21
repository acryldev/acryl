// Example: state.host-store  (host half)
// Type:     host-route
// Surfaces: web desktop
// Teaches:  PERSIST STATE ON THE HOST so it survives a browser reset and is shared by every window, browser and surface that uses the same
//           ACRYL home. The client calls an authenticated RPC channel (`connection.rpc.handle` here, `connection.rpc.call` in client.js);
//           the host keeps the data in a JSON file under the DSH home (`plugin-data/<plugin name>/`), written atomically.
//           Prefer this over a bare `webServer.register` route: the channel is behind the browser-auth and Host/Origin fence.
//           Compare: localStorage is per browser origin (Web and Desktop never share it).
// Expect:   ACTIVE on web/desktop; the client lists, adds and removes notes; the file `<DSH_HOME>/plugin-data/acryl-example-state-host/notes.json` holds them.
// Docs:     extending.state-and-persistence
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const name = 'acryl-example-state-host'
// `connection.rpc.handle` registers its channel through `webServer`, so both must be declared.
export const inject = ['connection', 'webServer']

const CHANNEL = '/acryl-example-state-host'
const MAX_NOTES = 500
const MAX_TEXT = 4000

/** The plugin's private data directory: `<DSH home>/plugin-data/<name>`. `dshHomePath` is the harness helper for the DSH home. */
function dataDir(ctx) {
  const home = ctx.get('dshHomePath')
  return typeof home === 'function' ? home('plugin-data', name) : join(homedir(), '.acryl', '.dsh', 'plugin-data', name)
}

export function apply(ctx) {
  const dir = dataDir(ctx)
  const file = join(dir, 'notes.json')

  function read() {
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8'))
      return Array.isArray(parsed) ? parsed.filter(n => n && typeof n.id === 'string' && typeof n.text === 'string') : []
    } catch { return [] }   // first run, or a damaged file: start empty rather than crash the plugin
  }
  // Write to a temp file and rename, so a crash mid-write never leaves half a JSON document.
  function write(notes) {
    mkdirSync(dir, { recursive: true })
    const temp = `${file}.tmp`
    writeFileSync(temp, JSON.stringify(notes, null, 2))
    renameSync(temp, file)
  }

  // A handler returns the RPC result shape: `{ ok: true, value }` or `{ ok: false, error: { code, message, details } }`. Any other shape is
  // rejected by the connection as "invalid server-response result".
  const fail = message => ({ ok: false, error: { code: 'bad-request', message, details: {} } })
  const done = notes => ({ ok: true, value: { notes } })

  const handlers = {
    list: () => done(read()),
    add: payload => {
      const text = String(payload?.text ?? '').trim()   // validate every input: the page can send anything
      if (text === '') return fail('text is required')
      if (text.length > MAX_TEXT) return fail(`text is too long (max ${MAX_TEXT})`)
      const notes = [{ id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, text, at: new Date().toISOString() }, ...read()].slice(0, MAX_NOTES)
      write(notes)
      return done(notes)
    },
    remove: payload => {
      const notes = read().filter(n => n.id !== String(payload?.id ?? ''))
      write(notes)
      return done(notes)
    },
  }

  ctx.connection.rpc.handle(CHANNEL, async (endpoint, payload) => {
    const handler = handlers[endpoint]
    if (!handler) return fail(`unknown endpoint ${JSON.stringify(endpoint)}`)
    try { return handler(payload) } catch (cause) { return fail(String(cause?.message ?? cause)) }
  })
}
