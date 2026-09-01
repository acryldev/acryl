/**
 * ACRYL browser surface: boot the shared runtime web profile and serve it.
 *
 * @module acryl-web/serve
 *
 * This is the 3rd ACRYL surface. It is deliberately TUI-free and Desktop-free:
 * it only own the web host (the `web` profile: `dsh-base` + `dsh-web-app`,
 * booted via `acryl-harness-runtime`'s `bootAcrylWebProfile`) and serves the
 * local web client. The terminal (`acryl`) and Electron (`acryl-desktop`)
 * surfaces are separate distributions.
 */

import { bootAcrylWebProfile } from 'acryl-harness-runtime'

export interface AcrylWebServeOptions {
  readonly cmdlineArgs?: readonly string[]
  /** Wait for a termination signal and dispose cleanly (default true for the bin; false for the JSON probe). */
  readonly waitForSignal?: boolean
}

export interface AcrylWebResult {
  readonly url: string
}

/**
 * Boot the ACRYL web runtime and (by default) serve until a termination
 * signal. Returns the serving URL.
 */
export async function serveWeb(
  options: AcrylWebServeOptions = {},
): Promise<AcrylWebResult> {
  const runtime = await bootAcrylWebProfile({
    cmdlineArgs: options.cmdlineArgs ? [...options.cmdlineArgs] : [],
  })
  const url = runtime.url
  if (options.waitForSignal === false) {
    // Headless readiness probe: report the URL and hand ownership back.
    return { url }
  }
  const stopped = new Promise<void>(resolve => {
    const onSignal = () => resolve()
    process.once('SIGINT', onSignal)
    process.once('SIGTERM', onSignal)
  })
  process.stdout.write(`ACRYL web: ${url}\n`)
  await stopped
  await runtime.dispose()
  return { url }
}
