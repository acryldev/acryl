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
import { createAcrylEngineHost, createWebEngineDefinition } from 'acryl-harness-runtime'

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
    engines: [createWebEngineDefinition()],
    initialEngine: 'dsh',
    prepare: hostCtx => {
      provideCmdline(hostCtx, { args: cmdlineArgs, exit: code => { process.exitCode = code } })
    },
  })
  const ctx = host.ctx
  const startup = ctx.get('webStartup') as { host?: string; port?: number } | undefined
  const startupHost = startup?.host ?? '127.0.0.1'
  const port = startup?.port ?? 3080
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
  const stopped = new Promise<void>(resolve => {
    const onSignal = () => resolve()
    process.once('SIGINT', onSignal)
    process.once('SIGTERM', onSignal)
  })
  process.stdout.write(`ACRYL web: ${url}\n`)
  await stopped
  await host.dispose()
  return { url, engine }
}
