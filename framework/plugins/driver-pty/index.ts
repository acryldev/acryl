/**
 * The PTY driver (M8, spec 046 T029): `claude`, `codex`, `pi` or any program in a real terminal inside the app folder, shown as a terminal tab of the agent panel. The agent
 * acts through the door as it does headless; the person sees and types into its own interactive mode.
 *
 * - The drivers are `terminal` entries of the panel's `drivers` service (`pty:claude`, ...). A panel without this plugin lists none; this plugin without a panel is pending.
 * - Transport is server-sent events down and POST up (no WebSocket): `POST /api/driver-pty/sessions`, `GET /api/driver-pty/<id>/output` (events with ids; a reconnect replays
 *   from `Last-Event-ID`, from a ring buffer of at least 64 KB), `POST .../input`, `.../resize`, `.../stop`. Same origin check and token as the panel, development only.
 * - The routes live under the app's mount, like the panel's: `/api/driver-pty` on the app's own server, `<mount>/api/driver-pty` when a host serves the app at a prefix
 *   (the frame's `/app`). The row's `mount` config names it, and each driver carries its view (`view: { module, prefix }`) so the panel calls the mounted paths.
 * - Every process is acquired inside one `ctx.effect`; its disposer ends the process (group), closes the streams and writes the audit line. Unloading or reloading the
 *   plugin with a session open leaves no process behind.
 */
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { clientModules } from '../acryl-node-server/src/client-modules.ts'
import { streamSSE } from '../acryl-router/src/helpers/index.ts'
import { Acryl } from '../acryl-router/src/index.ts'
import type { TerminalDriver, TerminalSession } from '../agent-panel/drivers.ts'
import { onPath } from '../agent-panel/headless.ts'
import { mountedBase, mountedPrefix } from '../agent-panel/mount.ts'
import type {} from '../agent-panel/registry.ts'
import { loadNodePty, type PtySpawn, resolveProgram } from './spawn.ts'
import { terminalDriver } from './terminal.ts'

export const name = 'driver-pty'
export const inject = ['drivers', 'router', 'appInstance']

export type { PtyProcess, PtySpawn } from './spawn.ts'
export { terminalDriver } from './terminal.ts'

const DRIVER_PATH = '/api/driver-pty'
const CLIENT_DIR = join(import.meta.dirname, 'client')
/** The least output a reconnecting page can be given again. */
const SCROLLBACK = 64 * 1024

export interface DriverPtyConfig {
  /** Programs to offer, by name: the arguments to start them with. Default: `claude`, `codex` and `pi`, the ones found on the machine. */
  programs?: Record<string, string[]>
  /** The PTY implementation; default node-pty. Tests give a fake. */
  spawn?: PtySpawn
  /**
   * The URL prefix the app is mounted at: empty on the app's own server, `/app` when the ACRYL frame hosts it (the same `mount` the panel takes). The
   * terminal's routes and its browser view live under it, so the terminal belongs to the app and is served wherever the app is.
   */
  mount?: string
}

interface Chunk {
  readonly id: number
  readonly text: string
}
type Item = Chunk | { exit: number | null } | { change: { extension: string; action: string } }
interface Live {
  readonly id: string
  readonly driver: string
  readonly session: TerminalSession
  readonly chunks: Chunk[]
  size: number
  next: number
  exit?: { code: number | null }
  readonly listeners: Set<
    (
      item: Chunk | { exit: number | null } | { change: { extension: string; action: string } },
    ) => Promise<void> | void
  >
  dispose(): Promise<void>
}

export async function apply(ctx: Context, config: DriverPtyConfig = {}): Promise<void> {
  if (process.env.NODE_ENV === 'production' || process.env.ACRYL_DOOR === 'off') return
  const PREFIX = mountedPrefix(config.mount, DRIVER_PATH, 'driver-pty')
  // The routes mount at the app's own mount and keep the fixed driver path inside (the frame's router prefixes the mount, not the routes).
  const MOUNT = mountedBase(config.mount, 'driver-pty')
  const root = ctx.appInstance.root
  let spawn = config.spawn
  if (!spawn) {
    try {
      spawn = await loadNodePty()
    } catch (error) {
      // No PTY here (no prebuilt binary, a sandbox): the panel lists no `pty:*` drivers, and says why.
      console.warn(
        `driver-pty: no terminal drivers, ${error instanceof Error ? error.message : String(error)}`,
      )
      return
    }
  }
  const programs =
    config.programs ??
    Object.fromEntries(
      (['claude', 'codex', 'pi'] as const).filter(onPath).map((p) => [p, [] as string[]]),
    )
  for (const [program, args] of Object.entries(programs))
    ctx.effect(() =>
      ctx.drivers.register(
        // The name stays the program the app configured; the PTY runs its full path (Windows does not search PATH itself).
        terminalDriver(`pty:${program}`, resolveProgram(program), args, spawn, {
          module: `${PREFIX}/client/terminal.ts`,
          prefix: PREFIX,
        }),
      ),
    )

  const auditFile = join(root, '.acryl', 'audit', 'driver-pty.jsonl')
  const audit = (entry: Record<string, unknown>): void => {
    try {
      mkdirSync(dirname(auditFile), { recursive: true })
      appendFileSync(auditFile, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`)
    } catch {
      // The audit never stops a session.
    }
  }

  let live: Live | undefined
  const refuse = (c: { json: (body: unknown, status: 403) => Response }) =>
    c.json({ error: "only the app's own page may use the terminal" }, 403)
  const find = (id: string): Live | undefined => (live?.id === id ? live : undefined)

  /** Starts a session; the process is acquired in one effect whose disposer ends it, however the session ends. */
  const startSession = (driver: TerminalDriver, cols: number, rows: number): Live => {
    let state!: Live
    let release!: () => Promise<void>
    let notified = false
    let finished = false
    /** Tells every open stream the session ended (once), and ends it for later readers. */
    const notify = async (code: number | null): Promise<void> => {
      if (notified) return
      notified = true
      state.exit = { code }
      const writes = [...state.listeners].map((listener) => listener({ exit: code }))
      state.listeners.clear()
      // Each write is accepted once its reader has taken it; a reader that went away must not hold the unload.
      await Promise.race([
        Promise.allSettled(writes),
        new Promise((done) => setTimeout(done, 1000)),
      ])
    }
    const finish = (code: number | null): void => {
      void notify(code)
      if (finished) return
      finished = true
      audit({ session: 'end', driver: driver.name, code })
    }
    release = ctx.effect(() => {
      const session = driver.start({ cwd: root, env: process.env, cols, rows })
      state = {
        id: session.id,
        driver: driver.name,
        session,
        chunks: [],
        size: 0,
        next: 1,
        listeners: new Set(),
        dispose: () => release(),
      }
      session.onData((text) => {
        const chunk = { id: state.next++, text }
        state.chunks.push(chunk)
        state.size += text.length
        while (state.chunks.length > 1 && state.size - state.chunks[0]!.text.length >= SCROLLBACK)
          state.size -= state.chunks.shift()!.text.length
        for (const listener of state.listeners) listener(chunk)
      })
      session.onExit((code) => finish(code))
      return async () => {
        // The streams are told first: unloading the plugin also takes its routes (and their open requests) down, and the page should hear why.
        await notify(null)
        await session.kill()
        finish(null)
      }
    }) as () => Promise<void>
    audit({ session: 'start', driver: driver.name })
    return state
  }

  // A plugin installed or removed while a terminal is open (by the agent, through the door): the page is told, so it reloads and shows the new feature.
  const off = ctx.on('extensions/changed', (extension: string, action: string) => {
    if (live && !live.exit)
      for (const listener of live.listeners) void listener({ change: { extension, action } })
  })
  ctx.effect(() => off)

  const app = new Acryl()
    .route(`${DRIVER_PATH}/client`, clientModules({ root: CLIENT_DIR, mount: `${PREFIX}/client` }))
    .post(`${DRIVER_PATH}/sessions`, async (c) => {
      if (!ctx.drivers.authorized(c.req.raw.headers)) return refuse(c)
      const body = (await c.req.json().catch(() => ({}))) as {
        driver?: unknown
        cols?: unknown
        rows?: unknown
      }
      const driver = typeof body.driver === 'string' ? ctx.drivers.get(body.driver) : undefined
      if (driver?.kind !== 'terminal')
        return c.json({ error: `"${String(body.driver)}" is not a terminal driver here` }, 400)
      if (live && !live.exit)
        return c.json({ error: 'a terminal is already open; stop it first' }, 409)
      const num = (value: unknown, fallback: number) =>
        typeof value === 'number' && value >= 1 && value <= 1000 ? Math.floor(value) : fallback
      let session: Live
      try {
        session = startSession(driver, num(body.cols, 80), num(body.rows, 24))
      } catch (error) {
        // The cause (a native module that cannot spawn, a program that is gone) goes to the app's log; the page gets a plain answer, as everywhere else.
        console.error('driver-pty: the terminal could not start:', error)
        return c.json({ error: 'the terminal could not start; the app log has the reason' }, 500)
      }
      live = session
      return c.json({ id: live.id })
    })
    .get(`${DRIVER_PATH}/:id/output`, (c) => {
      if (!ctx.drivers.authorized(c.req.raw.headers)) return refuse(c)
      const current = find(c.req.param('id'))
      if (!current) return c.json({ error: 'no such terminal' }, 404)
      const last = Number(c.req.header('last-event-id') ?? 0)
      return streamSSE(c, async (stream) => {
        const send = (chunk: Chunk): Promise<void> =>
          stream.writeSSE({ event: 'data', id: String(chunk.id), data: JSON.stringify(chunk.text) })
        // A reconnect that is older than the buffer starts over: the page clears its terminal first.
        const oldest = current.chunks[0]?.id ?? current.next
        if (last !== 0 && last + 1 < oldest) await stream.writeSSE({ event: 'reset', data: '{}' })
        for (const chunk of current.chunks) if (chunk.id > last) await send(chunk)
        if (current.exit) {
          await stream.writeSSE({
            event: 'exit',
            data: JSON.stringify({ code: current.exit.code }),
          })
          return
        }
        await new Promise<void>((done) => {
          const listener = async (item: Item): Promise<void> => {
            if ('change' in item)
              return stream.writeSSE({ event: 'change', data: JSON.stringify(item.change) })
            if (!('exit' in item)) return send(item)
            await stream
              .writeSSE({ event: 'exit', data: JSON.stringify({ code: item.exit }) })
              .finally(done)
          }
          current.listeners.add(listener)
          stream.onAbort(() => {
            current.listeners.delete(listener)
            done()
          })
        })
      })
    })
    .post(`${DRIVER_PATH}/:id/input`, async (c) => {
      if (!ctx.drivers.authorized(c.req.raw.headers)) return refuse(c)
      const current = find(c.req.param('id'))
      if (!current || current.exit) return c.json({ error: 'no such terminal' }, 404)
      const { data } = (await c.req.json().catch(() => ({}))) as { data?: unknown }
      if (typeof data !== 'string' || data.length > 64 * 1024)
        return c.json({ error: 'input is a string of at most 64 KB' }, 400)
      current.session.write(data)
      return c.json({ ok: true })
    })
    .post(`${DRIVER_PATH}/:id/resize`, async (c) => {
      if (!ctx.drivers.authorized(c.req.raw.headers)) return refuse(c)
      const current = find(c.req.param('id'))
      if (!current || current.exit) return c.json({ error: 'no such terminal' }, 404)
      const { cols, rows } = (await c.req.json().catch(() => ({}))) as {
        cols?: number
        rows?: number
      }
      if (typeof cols !== 'number' || typeof rows !== 'number')
        return c.json({ error: 'cols and rows are numbers' }, 400)
      current.session.resize(cols, rows)
      return c.json({ ok: true })
    })
    .post(`${DRIVER_PATH}/:id/stop`, async (c) => {
      if (!ctx.drivers.authorized(c.req.raw.headers)) return refuse(c)
      const current = find(c.req.param('id'))
      if (!current) return c.json({ error: 'no such terminal' }, 404)
      await current.dispose()
      return c.json({ ok: true })
    })
  ctx.router.route(MOUNT === '' ? '/' : MOUNT, app)
}
