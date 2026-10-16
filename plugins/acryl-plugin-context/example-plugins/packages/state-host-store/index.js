// Example: state.host-store  (host half)
// Type:     host-route
// Surfaces: web desktop
// Teaches:  PERSIST STATE ON THE HOST so it survives a browser reset and is shared by every window, browser and surface that uses the same
//           ACRYL home. The client calls `connection.rpc.call('/api', '<plugin>/<endpoint>', payload)` (client.js); the host answers on
//           exact routes under `/api` (`connection.fetch.register` here), in the RPC envelope, so the call is behind connection's
//           browser-auth and Host/Origin fence and works in stock DSH too. The data is a JSON file under the DSH home, written atomically.
//           Not `connection.rpc.handle`: stock DSH's connection row does not declare `webServer`, so a third-party channel fails there with
//           `cannot get property "webServer" without inject` (ACRYL patches that row; spec 044 S11). Not a bare `webServer.register`
//           route either: it would skip the auth fence.
//           Compare: localStorage is per browser origin (Web and Desktop never share it).
// Expect:   ACTIVE on web/desktop in ACRYL and in stock DSH; the client lists, adds and removes notes; the file
//           `<DSH_HOME>/plugin-data/acryl-example-state-host/notes.json` holds them.
// Docs:     extending.state-and-persistence
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const name = 'acryl-example-state-host'
// `connection` serves the routes (under its own `/api` route, so no `webServer` here). `dshHomePath` is declared too: the data directory
// comes only from the app's home, so in an app without it the plugin waits (PENDING) instead of guessing a folder.
export const inject = ['connection', 'dshHomePath']

/** Endpoints live at `/api/<PREFIX>/<endpoint>`; the client calls them as `connection.rpc.call('/api', '<PREFIX>/<endpoint>', payload)`. */
const PREFIX = 'acryl-example-state-host'
const MAX_NOTES = 500
const MAX_TEXT = 4000

/** The plugin's private data directory: `<DSH home>/plugin-data/<name>`. `dshHomePath` is the harness helper for the DSH home. */
function dataDir(ctx) {
  return ctx.get('dshHomePath')('plugin-data', name)
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

  // One exact route per endpoint. The request is the RPC envelope `rpc.call` sends ({ type: 'client-request', rpcId, method, payload });
  // the answer echoes its rpcId ({ type: 'server-response', rpcId, result }). Each registration is owned by this plugin and removed with it.
  for (const [endpoint, handler] of Object.entries(handlers)) {
    ctx.connection.fetch.register({
      path: `/api/${PREFIX}/${endpoint}`,
      methods: ['POST'],
      requestBody: 'buffered',
      async fetch(request) {
        let message
        try { message = await request.json() } catch { return new Response('body is not JSON', { status: 400 }) }
        if (message?.type !== 'client-request' || typeof message.rpcId !== 'string') return new Response('not an RPC request', { status: 400 })
        let result
        try { result = handler(message.payload) } catch (cause) { result = fail(String(cause?.message ?? cause)) }
        return Response.json({ type: 'server-response', rpcId: message.rpcId, result })
      },
    })
  }
}
