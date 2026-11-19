/**
 * `acryl-door`: the Door of the five nouns, as a Cordis plugin of a framework app (spec 049 slice 9). An agent working in the app folder
 * looks at the running page, acts on it, and installs plugins live, through `.acryl/bin/acryl`; everything else it does with its own
 * file tools and shell.
 *
 * The page loads `/api/acryl-door/page.js` (one script tag) and keeps an event stream open to the Host; the Host sends it calls. An
 * operator on this machine reaches `/api/acryl-door/call` with the secret from `<app>/.acryl/door.json`. One effect owns the channel and
 * the audit, the routes are mounted after it, and a second effect writes the connection file last, so disposal removes the file first,
 * then the routes (their in-flight calls end), then closes the channel (every pending call settles).
 */

import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Acryl } from 'acryl-router'
import type { UpgradeWebSocket } from 'acryl-router/helpers'
import { clientModules } from 'acryl-node-server/client-modules'
import { auditPath, AuditLog } from './host/audit.ts'
import { UiChannel } from './host/channel.ts'
import { registerChatTools } from './host/chat-tools.ts'
import { PAGE_VERBS, VERBS } from './host/verbs.ts'
import { Door, type ExtensionsPort, type PluginSharePort, type ToolsPort } from './host/door.ts'
import { assertDoorIsFree, newSecret, removeDoorFile, stateDir, writeDoorFile } from './host/door-file.ts'
import { DOOR_PREFIX, privateApi } from './host/http.ts'
import { mcpRoutes } from './host/mcp-routes.ts'
import { operatorRoutes } from './host/operator-routes.ts'
import { pageChannelRoutes } from './host/page-routes.ts'
import { pageSocketRoutes } from './host/page-socket.ts'
import { ShellChannel, shellRoutes } from './host/shell.ts'
import { realNode, writeShims, type ShimTarget } from './host/shim.ts'

/** Stable Cordis plugin name, equal to the package name and the Loader row id. */
export const name = 'acryl-door'

/** The part of acrylblends' `appInstance` the door reads: the app folder and its name. */
interface AppFolder {
  readonly root: string
  readonly name: string
}

/** The address the carrier listens on, as the `acrylWeb` service gives it (host and port; DSH's webServer serves it today). */
interface Listening {
  readonly host: string
  readonly port: number
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    door: Door
  }
}

// Two hosts serve the same door. On DSH (slice 1 of the IDE port) the carrier's address comes from `acrylWeb`, upgrades from `routerHttp`, and the page script
// goes into DSH's own index through the web server's index-inject hook (the framework's router.wrap never sees that page). On the plain node-server host the
// address and upgrades come from `nodeServer`, and `router.wrap` adds the script. Only `router` and `appInstance` are required; a host without the optional
// services simply takes the other path, so the door never stays PENDING beside a server that does not provide them.
export const inject = ['router', 'appInstance']

/** The services a host may provide in place of `acrylWeb`/`routerHttp` (the plain node-server host). */
interface NodeServerLike {
  readonly url?: string
  upgrades?: () => UpgradeWebSocket
}

export interface Config {
  tools?: { expose?: string[] }
  /**
   * The door is a development tool: with `NODE_ENV=production` the plugin starts nothing (no route, no `.acryl/` file, no service), and with `ACRYL_DOOR=off` it never does. A host that means to
   * run it in production (a packaged desktop app whose user drives it with an agent) says so here; `ACRYL_DOOR=off` still wins.
   */
  allowInProduction?: boolean
  /**
   * Page only, for a production assistant: the page channel and two chat tools, `door_look` and `door_act`, and nothing else - no operator routes, no MCP, no desktop
   * shell channel, no `.acryl/` file, no plugin, tool or window verbs. The app's agent can then use the page for a visitor and cannot change the app. Runs in production
   * without `allowInProduction`; `ACRYL_DOOR=off` still wins.
   */
  pageOnly?: boolean
  /** Reload the open pages after a live plugin change, so an agent that built a feature sees it on the page it has open. Default: true. */
  reloadOnChange?: boolean
  /**
   * Put the page script in the host's own index page (DSH's web UI) too, so an agent can drive that UI. Default: true. A host whose index is a frame
   * around the app (the ACRYL Blends frame, whose centre shows the app's page) turns it off: the door then drives the app's page in the canvas, and an
   * agent's `act navigate` or a reload after a plugin change never takes the person's tab out of the frame.
   */
  hostIndex?: boolean
  /**
   * The host prefix the app's pages are served under (the frame's canvas, `/app`); absent on the app's own server, where they are at the root. The
   * door puts it on every page as `<meta name="acryl-app-base">`, and `act navigate` with an app path goes under it: a page the app serves at
   * `/board` is reached at `/app/board` in the frame and at `/board` in production, and the same verb works in both.
   */
  appBase?: string
}

export const Config: z<Config> = z.object({
  allowInProduction: z.boolean().default(false).description('Run in production too (NODE_ENV=production); ACRYL_DOOR=off still turns it off.'),
  pageOnly: z.boolean().default(false).description('Only the page and the look and act chat tools (a production assistant); runs in production.'),
  reloadOnChange: z.boolean().default(true).description('Reload the open pages after a plugin was added, removed or reloaded while the app runs.'),
  hostIndex: z.boolean().default(true).description("Put the page script in the host's own index page too; off when that index is a frame around the app."),
  appBase: z.string().default('').description('The prefix the app pages are served under (the frame canvas), without a trailing slash; empty at the root.'),
  tools: z.object({
    // Not a `door_` name: those are the door's own verbs in the registry, never offered back as app tools.
    expose: z.array(z.string().pattern(/^(?!door_)[A-Za-z][A-Za-z0-9_-]{0,63}$/u)).description('App tools (from the tools registry) the door offers; none by default.'),
  }),
})

/** The page module, served compiled from source by the app's own TypeScript. */
const PAGE_DIR = join(import.meta.dirname, import.meta.url.endsWith('.ts') ? 'page' : join('..', 'src', 'page'))

/** The operator client this build runs: the source next to this file, or the built `cli.js`. */
const CLIENT = import.meta.url.endsWith('.ts') ? join(import.meta.dirname, 'cli', 'acryl.ts') : join(import.meta.dirname, 'cli.js')

/** How the folder's `.acryl/bin/acryl` starts the client: with the Node that runs the app, and its type-stripping flag when run from source. */
function shimTarget(): ShimTarget {
  const fromSource = CLIENT.endsWith('.ts')
  const inElectron = process.versions.electron !== undefined
  // Inside Electron the command prefers a real Node (no code-signing noise on every call); without one, Electron runs the client.
  const node = inElectron ? realNode() : undefined
  return {
    node: node ?? process.execPath,
    nodeOptions: fromSource ? process.execArgv.filter(option => /^--experimental-(strip|transform)-types$/u.test(option)) : [],
    client: CLIENT,
    electron: inElectron && node === undefined,
  }
}

/** A listening address as one the operator reaches: an any-address bind is reached on loopback. */
function loopbackUrl(url: string): string {
  const parsed = new URL(url)
  if (parsed.hostname === '0.0.0.0' || parsed.hostname === '[::]') parsed.hostname = '127.0.0.1'
  return parsed.origin
}

const escapeHtml = (text: string): string => text.replace(/[&<>"']/gu, char => `&#${char.charCodeAt(0)};`)

/** The page of a path the app does not serve, development only: what is missing, a way back, and the door's script. */
export function notFoundPage(path: string, scriptTag: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>404 Not Found</title></head><body><main><h1>404 Not Found</h1><p>This app has no page at <code>${escapeHtml(path)}</code>.</p><p><a href="/">Back to the app</a></p></main>${scriptTag}</body></html>`
}

export function apply(ctx: Context, rawConfig: Config = {}): void {
  const config = Config(rawConfig)
  // Development only: nothing is started, mounted or written in production, or when switched off.
  const pageOnly = config.pageOnly === true
  if (process.env.ACRYL_DOOR === 'off' || (process.env.NODE_ENV === 'production' && config.allowInProduction !== true && !pageOnly)) return
  const app = ctx.get('appInstance') as unknown as AppFolder
  // The carrier, as the host provides it: DSH's `acrylWeb`, or the plain node server's own url. Read when used, never captured at apply time.
  const carrier = (): Listening | undefined => {
    const web = ctx.get('acrylWeb') as unknown as Listening | undefined
    if (web !== undefined) return web
    const node = ctx.get('nodeServer') as unknown as NodeServerLike | undefined
    if (typeof node?.url !== 'string') return undefined
    try {
      const parsed = new URL(node.url)
      return { host: parsed.hostname, port: Number(parsed.port) }
    } catch {
      return undefined
    }
  }
  if (typeof app?.root !== 'string') throw new Error('acryl-door: the appInstance service has no app folder (root)')
  const reportError = (operation: string, cause: unknown): void => {
    ctx.logger?.error?.(`acryl-door: failed to ${operation}: ${cause instanceof Error ? cause.message : String(cause)}`)
  }
  const address: { url: string } = { url: '' }
  // The rival check runs at activation, not in the deferred write: a folder another live process serves fails the row at once (the write waits for a bound port).
  // A page-only door writes no file, so it has no rival to check.
  if (!pageOnly) assertDoorIsFree(app.root)
  const secret = newSecret()
  // A look right after a navigate or reload waits up to two seconds for the page that is moving to register again, and a read-only call that no page acknowledged gives a page that just registered one more try.
  // A page-only door serves every visitor of the app on one channel: each call goes to the page of the visitor whose run made it, never to another visitor's page.
  const channel = new UiChannel({ attachWaitMs: 2000, requirePage: pageOnly })
  const shell = new ShellChannel()
  const audit = new AuditLog(auditPath(stateDir(app.root)))
  // Where the app's pages answer under this host (`/app` in the frame): `act navigate` sends an app path there, and a page may read it from the
  // head. The app's own server has no prefix and no meta.
  const rawBase = typeof config.appBase === 'string' ? config.appBase.trim() : ''
  const appBase = rawBase.startsWith('/') && rawBase !== '/' ? rawBase.replace(/\/+$/u, '') : ''
  const door = new Door({
    channel,
    shell,
    audit,
    // The address is read when it is used, not when the plugin applies: the carrier binds after the fiber starts (DSH's webServer reports its listening port only then).
    app: { name: app.name, root: app.root, get url() { return address.url } },
    ...(appBase === '' ? {} : { appBase }),
    extensions: () => ctx.get('extensions') as unknown as ExtensionsPort | undefined,
    pluginShare: () => ctx.get('pluginShare') as unknown as PluginSharePort | undefined,
    tools: () => ctx.get('tools') as unknown as ToolsPort | undefined,
    expose: config.tools?.expose ?? [],
    reloadOnChange: config.reloadOnChange !== false,
  })
  ctx.effect(() => () => { channel.close() }, 'acryl-door: page channel')
  ctx.effect(() => () => { shell.close() }, 'acryl-door: desktop shell channel')
  // One script tag for the page (`page.js`): it imports the module tree served below it.
  const pageModule = new Acryl()
    .get(`${DOOR_PREFIX}/page.js`, c => c.body(`import '${DOOR_PREFIX}/page/main.ts'\n`, 200, { 'content-type': 'text/javascript; charset=utf-8' }))
    .route(`${DOOR_PREFIX}/page`, clientModules({ root: PAGE_DIR, mount: `${DOOR_PREFIX}/page` }))
  // The page script on every HTML page the app answers, whenever its plugin was mounted (the pages of a plugin that loaded at boot, before this one, included): a page an agent writes
  // can be looked at and driven without anyone adding the tag. A page that already carries it keeps one copy. Development only, like the rest of the door.
  const tag = `<script type="module" src="${DOOR_PREFIX}/page.js"></script>`
  const meta = appBase === '' ? '' : `<meta name="acryl-app-base" content="${appBase}">`
  const addScript = async (c: { res: Response; req: { path: string; header(name: string): string | undefined } }, next: () => Promise<void>): Promise<void> => {
    await next()
    if (!(c.res.headers.get('content-type') ?? '').includes('text/html')) {
      // A path the app does not serve, opened as a page: the browser would show a bare "404 Not Found" with no script, and the window would be left where nothing can look at it or
      // act on it (an agent that mistypes a path would need a person to bring the window back). The page says what is missing, carries the script, and keeps the 404.
      if (c.res.status === 404 && (c.req.header('accept') ?? '').includes('text/html') && !(c.res.headers.get('content-type') ?? '').includes('json'))
        c.res = new Response(notFoundPage(c.req.path, tag), { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } })
      return
    }
    let html = await c.res.text()
    const headers = new Headers(c.res.headers)
    headers.delete('content-length')
    if (meta !== '' && !html.includes('name="acryl-app-base"'))
      html = html.includes('</head>') ? html.replace('</head>', `${meta}</head>`) : meta + html
    if (!html.includes(`${DOOR_PREFIX}/page.js`))
      html = html.includes('</body>') ? html.replace('</body>', `${tag}</body>`) : html + tag
    c.res = new Response(html, { status: c.res.status, headers })
  }
  const router = ctx.router as unknown as { wrap?: (middleware: typeof addScript) => unknown }
  // An app whose router copy is older than this plugin has no `wrap`: the middleware then covers the routes mounted after the door, as the agent panel's does.
  if (typeof router.wrap === 'function') router.wrap(addScript)
  else ctx.router.route('/', new Acryl().use('*', addScript as never))
  // DSH's own index.html is not a framework route, so `router.wrap` never sees it: the tag goes in through the web server's index-inject hook instead. The
  // tap is owned by this plugin's fiber, so unloading the door takes the tag with it, and the new activation's page routes answer under the new secret.
  if (config.hostIndex !== false) ctx.inject(['webServer'], inner => {
    inner.effect(() => {
      const taps = inner.get('webServer') as unknown as { tapIndex?: (transform: (html: string) => string) => () => void } | undefined
      if (typeof taps?.tapIndex !== 'function') return () => {}
      return taps.tapIndex(html => {
        if (html.includes(`${DOOR_PREFIX}/page.js`)) return html
        return html.includes('</body>') ? html.replace('</body>', `${tag}</body>`) : html + tag
      })
    }, 'acryl-door: the page script in the host index')
  })
  // The page channel also runs over a WebSocket, which is not one of the browser's six connections per host. Without `ws` or an adapter that
  // upgrades, the pages use the stream. The socket route is mounted ONCE here, ahead of the private routes, so it keeps its precedence when the host
  // restarts; what moves is the upgrade helper it reads per request. While routerHttp exists its inject scope owns the prefix claim and sets the
  // helper (Cordis disposes the claim exactly when the service goes away); the node server's hub is the helper only while routerHttp is absent.
  // An upgrade while no helper is ready is refused 503 by the route, never answered twice.
  let pageUpgrade: UpgradeWebSocket | undefined
  let nodeUpgrade: UpgradeWebSocket | undefined
  const endNodeOwner = (): void => {
    if (pageUpgrade === nodeUpgrade) pageUpgrade = undefined
    nodeUpgrade = undefined
  }
  const nodeFallback = (): void => {
    if (ctx.get('routerHttp') !== undefined || nodeUpgrade !== undefined) return
    try {
      const allow = (ctx.get('nodeServer') as unknown as NodeServerLike | undefined)?.upgrades?.()
      if (allow !== undefined) {
        nodeUpgrade = allow
        pageUpgrade = allow
      }
    } catch (cause) {
      reportError('open the page channel over a WebSocket (the pages use the event stream)', cause)
    }
  }
  ctx.inject(['routerHttp'], (inner) => {
    // The adapter is here: the node helper gives way, and this scope owns the prefix claim and the helper until Cordis disposes it with the service.
    endNodeOwner()
    const http = inner.get('routerHttp') as unknown as
      | { upgrades?: () => UpgradeWebSocket; mount?: (prefix: string, options: { upgrade: string[] }) => () => void }
      | undefined
    try {
      const allow = http?.upgrades?.()
      if (allow === undefined || http === undefined || typeof http.mount !== 'function') return
      pageUpgrade = allow
      const remove = http.mount(DOOR_PREFIX, { upgrade: [`${DOOR_PREFIX}/channel/ws`] })
      inner.effect(() => () => {
        remove()
        if (pageUpgrade === allow) pageUpgrade = undefined
        nodeFallback()
      }, 'acryl-door: the page socket via routerHttp')
    } catch (cause) {
      reportError('open the page channel over a WebSocket (the pages use the event stream)', cause)
    }
  })
  ctx.inject(['nodeServer'], (inner) => {
    inner.effect(() => {
      nodeFallback()
      const onService = inner.on as unknown as (name: string, listener: () => void) => () => void
      const off = onService('internal/service', () => {
        if (ctx.get('routerHttp') !== undefined) endNodeOwner()
        else nodeFallback()
      })
      return () => {
        off()
        endNodeOwner()
      }
    }, 'acryl-door: the page socket on the node server')
  })
  ctx.router.route('/', pageSocketRoutes(channel, { prefix: DOOR_PREFIX, upgrade: () => pageUpgrade }))
  ctx.router.route('/', privateApi(
    DOOR_PREFIX,
    pageModule,
    pageChannelRoutes(channel, { prefix: DOOR_PREFIX }),
    ...(pageOnly ? [] : [
      shellRoutes(DOOR_PREFIX, secret, shell),
      operatorRoutes(DOOR_PREFIX, secret, door, reportError),
      mcpRoutes(DOOR_PREFIX, secret, door, reportError),
    ]),
  ))
  // The built-in chat's agent reads the `tools` registry: the verbs are in it while both are up.
  ctx.inject(['tools'], (inner) => {
    inner.effect(() => registerChatTools(inner.get('tools') as unknown as ToolsPort, door, pageOnly ? PAGE_VERBS : VERBS), 'acryl-door: the verbs in the tools registry')
  })
  ctx.effect(function* () {
    yield ctx.reflect.provide('door', door)
  }, 'acryl-door: the door service')
  // A page-only door leaves no file and no command for an operator.
  if (pageOnly) return
  // The carrier binds asynchronously (DSH's webServer, the node server before it): the address and the file are written once it reports a real port.
  ctx.effect(async () => {
    let bound = carrier()
    for (let at = 0; at < 500 && (bound === undefined || !(bound.port > 0)); at += 1) {
      await new Promise((done) => setTimeout(done, 10))
      bound = carrier()
    }
    if (bound === undefined) throw new Error('acryl-door: no carrier bound the app (neither acrylWeb nor nodeServer answered)')
    address.url = loopbackUrl(`http://${bound.host}:${String(bound.port)}`)
    writeDoorFile(app.root, address.url, secret)
    // A shim that cannot be replaced (Windows, held open by a running `acryl`) leaves the old one in place; it must not stop the app from starting.
    try { writeShims(app.root, shimTarget()) } catch (cause) { reportError('write .acryl/bin', cause) }
    return () => { removeDoorFile(app.root, secret) }
  }, 'acryl-door: .acryl/door.json and .acryl/bin/acryl')
}

export { Door, DoorError, type VerbAnswer } from './host/door.ts'
export { chatToolName, PAGE_VERBS, VERB_SPECS, VERBS, type Verb, type VerbSpec } from './host/verbs.ts'
export { mcpTools } from './host/mcp-routes.ts'
export { DOOR_PREFIX } from './host/http.ts'
export { assertDoorIsFree, doorFilePath, readDoorFile, STATE_DIR, type DoorFile } from './host/door-file.ts'
export type { CallResponse } from './host/operator-routes.ts'
