/**
 * Cordis Host plugin for the terminal: DeepSeek account sign-in without a web server.
 *
 * DeepSeek's account service returns the browser to `<origin>/oauth/callback`, a route it registers on `webServer`. The
 * terminal has no web server, and DSH's would also wake the API gateway, which serves the API with no credential check.
 * This row provides a loopback server that offers only route registration, as `webServer` inside the Loader realm
 * {@link ACCOUNT_CALLBACK_REALM}; the `deepseek-account` row is patched into the same realm, so it is the only row that
 * can see the server. It listens on the first sign-in, on an ephemeral port, and closes with the row.
 *
 * It also provides `acrylAccountSignIn` (`AccountSignInPort` in `acryl-control`), which the terminal's `/login` uses.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { createRequire } from 'node:module'
import type { Socket } from 'node:net'
import type { Context } from '@deepseek-ai/cordis'
import { ACCOUNT_SIGN_IN_SERVICE, type AccountSignInOutcome, type AccountSignInPort } from 'acryl-control'
import {
  DEEPSEEK_ACCOUNT_KEY, DEEPSEEK_ACCOUNT_ROUTE, accountAttemptView,
  type DeepSeekAccountPort, type DeepSeekAccountView,
} from './deepseek-account.ts'

export const name = 'acryl-sign-in-account-callback'
export const inject = ['deepseekAccount']

/** The Loader isolation label shared by this row and the `deepseek-account` row (`isolate: { webServer: <label> }`). */
export const ACCOUNT_CALLBACK_REALM = 'acryl-account-callback'

const VERSION = (createRequire(import.meta.url)('../package.json') as { version: string }).version
const HOST = '127.0.0.1'

type Handler = (req: IncomingMessage, res: ServerResponse) => void

/** The share of DSH's `webServer` DeepSeek's account service uses: one exact route at a time. */
export interface CallbackRoute {
  readonly kind: 'exact'
  readonly path: string
  readonly handler: Handler
}

/** A loopback HTTP server that serves only the exact routes registered on it, and 404 for everything else. */
export class LoopbackCallbackServer {
  readonly host = HOST
  private readonly routes = new Map<string, Handler>()
  private readonly sockets = new Set<Socket>()
  private server: Server | undefined
  private listening: Promise<string> | undefined
  private closed = false

  get port(): number {
    const address = this.server?.address()
    return typeof address === 'object' && address !== null ? address.port : 0
  }

  register(route: CallbackRoute): () => void {
    if (route.kind !== 'exact') throw new Error(`acryl-sign-in: the account callback server serves exact routes only, not ${String(route.kind)}`)
    if (this.routes.has(route.path)) throw new Error(`acryl-sign-in: route ${route.path} is already registered`)
    this.routes.set(route.path, route.handler)
    return () => { if (this.routes.get(route.path) === route.handler) this.routes.delete(route.path) }
  }

  /** The server's origin (`http://127.0.0.1:<port>`), listening first if it is not yet. */
  origin(): Promise<string> {
    if (this.closed) return Promise.reject(new Error('acryl-sign-in: the account callback server is closed'))
    this.listening ??= new Promise<string>((resolve, reject) => {
      const server = createServer((req, res) => { this.handle(req, res) })
      server.on('connection', (socket) => {
        this.sockets.add(socket)
        socket.once('close', () => { this.sockets.delete(socket) })
      })
      server.once('error', (error) => {
        this.server = undefined
        this.listening = undefined
        reject(error)
      })
      server.listen(0, HOST, () => { resolve(`http://${HOST}:${String(this.port)}`) })
      this.server = server
    })
    return this.listening
  }

  async close(): Promise<void> {
    this.closed = true
    const server = this.server
    this.server = undefined
    if (server === undefined) return
    const done = new Promise<void>((resolve) => { server.close(() => { resolve() }) })
    for (const socket of this.sockets) socket.destroy()
    await done
  }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    // Only the browser's own redirect to this exact origin; a rebound hostname is refused.
    if (req.headers.host !== `${HOST}:${String(this.port)}`) {
      res.writeHead(421, { 'cache-control': 'no-store' }).end()
      return
    }
    const path = (req.url ?? '/').split('?')[0] ?? '/'
    const handler = this.routes.get(path)
    if (handler === undefined) {
      res.writeHead(404, { 'cache-control': 'no-store' }).end()
      return
    }
    handler(req, res)
  }
}

/** The share of `deepseekAccount` a sign-in follows to its end. */
export interface DeepSeekAccountWatchPort extends DeepSeekAccountPort {
  watch(signal: AbortSignal): AsyncIterable<DeepSeekAccountView>
}

/** {@link AccountSignInPort} over DeepSeek's account service and a callback origin. */
export class AccountSignIn implements AccountSignInPort {
  readonly key = DEEPSEEK_ACCOUNT_KEY
  readonly route = DEEPSEEK_ACCOUNT_ROUTE

  constructor(private readonly ports: {
    readonly account: () => DeepSeekAccountWatchPort
    readonly origin: () => Promise<string>
    readonly version: string
  }) {}

  async signIn(request: Parameters<AccountSignInPort['signIn']>[0]): Promise<AccountSignInOutcome> {
    if (request.signal?.aborted === true) return { status: 'cancelled' }
    const account = this.ports.account()
    const client = { version: this.ports.version, locale: request.locale ?? 'en', timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60 }
    // The terminal is an installed client like Desktop: DeepSeek's page tells the person to go back to it.
    const started = await account.startSignIn(client, await this.ports.origin(), 'desktop')
    const id = started.attempt?.id
    if (id === undefined) return { status: 'failed', error: 'DeepSeek did not start a sign-in. Try again.' }
    const cancel = (): void => { void account.cancelSignIn(id).catch(() => undefined) }
    request.signal?.addEventListener('abort', cancel, { once: true })
    const watching = new AbortController()
    let opened = false
    try {
      for await (const state of account.watch(watching.signal)) {
        const attempt = state.attempt
        // Another sign-in replaced this one.
        if (attempt === null || attempt.id !== id) return { status: 'cancelled' }
        if (!opened && attempt.authorizeUrl !== undefined) {
          opened = true
          request.notify(attempt.authorizeUrl)
        }
        const view = accountAttemptView(attempt)
        if (view.phase === 'authorized') return { status: 'authorized' }
        if (view.phase === 'cancelled') return { status: 'cancelled' }
        if (view.phase === 'failed') return { status: 'failed', error: view.error ?? 'The sign-in failed. Try again.' }
      }
      // The account service closed (its row unloaded) before the sign-in ended.
      return { status: 'cancelled' }
    } finally {
      watching.abort()
      request.signal?.removeEventListener('abort', cancel)
    }
  }
}

export function apply(ctx: Context): void {
  const server = new LoopbackCallbackServer()
  const signIn = new AccountSignIn({
    account: () => (ctx as unknown as { deepseekAccount: DeepSeekAccountWatchPort }).deepseekAccount,
    origin: () => server.origin(),
    version: VERSION,
  })
  ctx.effect(() => () => server.close(), 'acryl-sign-in: account callback server')
  // `webServer` resolves into this row's isolation realm (see the module comment), so only the account row sees it.
  ctx.effect(() => {
    const dispose = ctx.reflect.provide('webServer', server)
    return () => { void dispose() }
  }, 'acryl-sign-in: account callback webServer')
  ctx.effect(() => {
    const dispose = ctx.reflect.provide(ACCOUNT_SIGN_IN_SERVICE, signIn)
    return () => { void dispose() }
  }, 'acryl-sign-in: acrylAccountSignIn')
}
