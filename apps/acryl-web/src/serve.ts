/**
 * ACRYL browser surface: boot the shared runtime web profile and serve it.
 *
 * @module acryl-web/serve
 *
 * This is the 3rd ACRYL surface. It is deliberately TUI-free and Desktop-free:
 * it only owns the web host (the `web` profile: `dsh-base` + `dsh-web-app`,
 * mounted through `acryl-harness-runtime`'s `createAcrylEngineHost` +
 * `createWebEngineDefinition`) and serves the local web client. The terminal
 * (`acryl`) and Electron (`acryl-desktop`) surfaces are separate
 * distributions.
 *
 * Re-pointed from the earlier direct `bootAcrylWebProfile` call (its own
 * second Cordis root) onto the shared engine host, per spec 028's "Engine 1
 * everywhere" sequencing - the same treatment `acryl-cli` and `acryl-desktop`
 * already have. `bootAcrylWebProfile` itself is unchanged and still exported
 * for any other consumer; this file just no longer calls it.
 */

import type {} from '@deepseek-ai/dsh-client-connection'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import {
  announceSelf,
  createAcrylEngineHost,
  createWebEngineDefinition,
  type AppInstance,
} from 'acryl-harness-runtime'

export interface AcrylWebServeOptions {
  readonly cmdlineArgs?: readonly string[]
  /** Wait for a termination signal and dispose cleanly (default true for the bin; false for the JSON probe). */
  readonly waitForSignal?: boolean
}

export interface AcrylWebResult {
  readonly url: string
  /** The engine Loader row currently mounted beneath the host's Cordis root. */
  readonly engine: string
}

/**
 * Boot the ACRYL web runtime and (by default) serve until a termination
 * signal. Returns the serving URL.
 */
export async function serveWeb(
  options: AcrylWebServeOptions = {},
): Promise<AcrylWebResult> {
  const cmdlineArgs = options.cmdlineArgs ? [...options.cmdlineArgs] : []
  const host = await createAcrylEngineHost({
    engines: [createWebEngineDefinition(new URL('../package.json', import.meta.url).href)],
    initialEngine: 'dsh',
    prepare: hostCtx => {
      provideCmdline(hostCtx, { args: cmdlineArgs, exit: code => { process.exitCode = code } })
    },
  })
  const ctx = host.ctx
  const startup = ctx.get('webStartup') as { host?: string; port?: number } | undefined
  // The listening server is the source of truth: a profile that moves the `webserver` row to another port (a second instance beside
  // one on 3080) would otherwise print the startup default and hand the user a dead URL.
  const listening = ctx.get('webServer') as { host?: string; port?: number } | undefined
  const boundHost = listening?.host ?? startup?.host ?? '127.0.0.1'
  // An all-interface bind (a container, ACRYL_WEB_HOST=0.0.0.0) is not an address a browser can open: print loopback, which works from the same machine
  // or container; whoever exposes the server (a proxy, a port mapping) swaps the origin and keeps the token.
  const startupHost = boundHost === '0.0.0.0' ? '127.0.0.1' : boundHost === '::' ? '[::1]' : boundHost
  const port = listening?.port ?? startup?.port ?? 3080
  const baseUrl = `http://${startupHost}:${port}`
  // The served index requires this process's launch token as its sole
  // authentication input (dsh-client-connection's authorizeIndex) - a bare
  // origin without it renders "authentication required; reopen the URL
  // printed by dsh web" instead of the app. connection is present whenever
  // the web profile mounts dsh-client-connection (always, for the shipped
  // `web` profile); optional here only because nothing in this package's
  // own type graph can assert that composition-time fact.
  const url = ctx.get('connection')?.authenticatedUrl(baseUrl) ?? baseUrl
  const engine = host.currentEngine()
  if (options.waitForSignal === false) {
    // Headless readiness probe: boot, report the URL, then dispose the runtime
    // so the HTTP server does not keep the process alive.
    await host.dispose()
    return { url, engine }
  }
  // This process serves the app, so it holds the claim and the Registry entry (spec 048 T011): the Registry records the port the server really bound,
  // and `acryl control list` finds the app whichever launcher started it. A second live app on the same instance is refused before it serves anything.
  const instance = ctx.get('appInstance' as never) as AppInstance | undefined
  const announcement = instance === undefined ? undefined : announceSelf(instance, { surface: 'web', port })
  // `on`, not `once`, until disposal ends: a terminal's Ctrl-C reaches this process and the `acryl` launcher that started it, which passes stop
  // signals on, so a second signal can arrive while the host disposes, and its default action would end the process before it freed the port.
  let onSignal = () => {}
  const stopped = new Promise<void>(resolve => { onSignal = () => { resolve() } })
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)
  process.stdout.write(`ACRYL web: ${url}\n`)
  try {
    await stopped
  } finally {
    announcement?.release()
    await host.dispose()
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
  }
  return { url, engine }
}
