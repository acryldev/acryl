/**
 * The `webServer` port for a framework-hosted app. DSH's driver rows (the chat's connection and its remote gateway) register node handlers with
 * `webServer.register` and `webServer.registerUpgrade`; this plugin serves them on the framework's own node server, so those rows run unchanged
 * while the HTTP host, the page and the client-module serving stay ours.
 *
 * It is the inverse of `acryl-router-http`: there the Host's web server serves a router prefix; here our node server presents the web-server
 * interface a DSH row expects. The surface is deliberately small: `host` and `port` (what `acryl-web` reads), `register` (exact or prefix),
 * `registerUpgrade` (one exact path), and the index taps the page serving applies. A row that needs more of DSH's interface gets the extra
 * method here, named with the row that needs it - so this seam can shrink when a row goes away.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import { Context, Service } from '@deepseek-ai/cordis'
import type { NodeServer, RawRoute, RawUpgradeRoute } from 'acryl-node-server'

/** Stable Cordis plugin name, equal to the package name and the Loader row id. */
export const name = 'acryl-web-server'

/** Hard requirement: the node server whose raw routes carry these handlers. */
export const inject = ['nodeServer']

/** A node handler at a path `exact` (the pathname itself) or a `prefix` (the path and everything below it). */
export interface WebServerRoute {
  readonly kind: 'prefix' | 'exact'
  readonly path: string
  readonly handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}

/** One exact-path upgrade handler; the socket belongs to the handler once its path matches. */
export interface WebServerUpgradeRoute {
  readonly path: string
  readonly handler: (req: IncomingMessage, socket: Duplex, head: Buffer) => void | Promise<void>
}

/** Transforms the served index document, in registration order. */
export type IndexTap = (html: string) => string

/** What a driver row (or `acryl-web`) reads from `webServer`. */
export interface WebServerService {
  /** The address the node server bound. */
  readonly host: string
  readonly port: number
  /** Serve `route` until the returned remover runs or the calling plugin unloads. A path already served throws. */
  register(route: WebServerRoute): () => void
  /** Claim `route.path` for an upgrade until the returned remover runs or the calling plugin unloads. */
  registerUpgrade(route: WebServerUpgradeRoute): () => void
  /** Transform the served index document while the caller lives; returns its remover. */
  tapIndex(transform: IndexTap): () => void
  /** The document with the structured injection rows (the client modules' boot wire) and then every live tap applied. */
  index(html: string): string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    webServer: WebServerService
  }
}

/** One structured index-injection row (DSH's contract): the kinds the client modules and a door script use. */
interface IndexRow {
  readonly kind?: string
  readonly placement?: 'head' | 'body'
  readonly text?: string
  readonly src?: string
  readonly name?: string
  readonly value?: unknown
}

/** The boot-readiness tail the client shell waits for, as DSH renders it. */
const READY_MARKUP = '<script>(globalThis.__DSH_BOOT_READY__ ??= Promise.withResolvers()).resolve()</script>'

/** A JSON literal safe inside a `<script>`: a sequence like `</script>` must not end it. */
const scriptJson = (value: unknown): string => JSON.stringify(value).replaceAll('</', '<\\/')

/** Render one row; an unknown kind is skipped rather than emitted as broken markup. */
function rowMarkup(row: IndexRow): string {
  if (row.kind === 'script') return `<script>${row.text ?? ''}</script>`
  if (row.kind === 'script-src') return `<script type="module" crossorigin src="${row.src ?? ''}"></script>`
  if (row.kind === 'script-preload') return `<link rel="modulepreload" crossorigin href="${row.src ?? ''}" />`
  if (row.kind === 'global') return `<script>globalThis[${scriptJson(row.name ?? '')}] = ${scriptJson(row.value)}</script>`
  return ''
}

/** Insert each group after its opening tag, as DSH's served index does; a document without the tag gets the group first. */
export function renderIndexRows(html: string, rows: readonly IndexRow[]): string {
  let head = ''
  let body = ''
  for (const row of rows) {
    const markup = rowMarkup(row)
    if (markup === '') continue
    if (row.placement === 'body') body += markup
    else head += markup
  }
  body += READY_MARKUP
  let document = html
  const headOpen = /<head(?:\s[^>]*)?>/iu.exec(document)
  if (head !== '') {
    const at = headOpen === null ? 0 : headOpen.index + headOpen[0].length
    document = `${document.slice(0, at)}${head}${document.slice(at)}`
  }
  const bodyOpen = /<body(?:\s[^>]*)?>/iu.exec(document)
  if (body !== '') {
    const at = bodyOpen === null ? document.length : bodyOpen.index + bodyOpen[0].length
    document = `${document.slice(0, at)}${body}${document.slice(at)}`
  }
  return document
}

/** The port, backed by `nodeServer`'s raw routes; every registration belongs to the plugin that made it. */
export class WebServer extends Service implements WebServerService {
  private readonly taps: IndexTap[] = []

  constructor(ctx: Context) {
    super(ctx, 'webServer')
  }

  get host(): string {
    return this.ctx.nodeServer.hostname
  }

  get port(): number {
    return this.ctx.nodeServer.port
  }

  register(route: WebServerRoute): () => void {
    const remove = this.ctx.nodeServer.registerRaw(route as RawRoute)
    this.ctx.effect(() => () => { remove() }, `acryl-web-server: ${route.kind} ${route.path}`)
    return remove
  }

  registerUpgrade(route: WebServerUpgradeRoute): () => void {
    const remove = this.ctx.nodeServer.registerRawUpgrade(route as RawUpgradeRoute)
    this.ctx.effect(() => () => { remove() }, `acryl-web-server: upgrade ${route.path}`)
    return remove
  }

  tapIndex(transform: IndexTap): () => void {
    this.taps.push(transform)
    const remove = (): void => {
      const at = this.taps.indexOf(transform)
      if (at >= 0) this.taps.splice(at, 1)
    }
    this.ctx.effect(() => () => { remove() }, 'acryl-web-server: index tap')
    return remove
  }

  index(html: string): string {
    // The rows are DSH's index-injection contract (`webserver/index-inject`): the client-module row pushes its boot wire there. The rows render
    // first, the string taps after, the same order DSH's own web server uses.
    const rows: IndexRow[] = []
    ;(this.ctx as unknown as { emit(name: string, table: IndexRow[]): void }).emit('webserver/index-inject', rows)
    let document = renderIndexRows(html, rows)
    for (const tap of [...this.taps]) document = tap(document)
    return document
  }
}

/** Provide `webServer` on this context; the node server must already be up (the plugin injects it). */
export function apply(ctx: Context): void {
  new WebServer(ctx)
}

/** Re-exported for callers that shape their own routes: the raw types the port is built on. */
export type { NodeServer, RawRoute, RawUpgradeRoute }
