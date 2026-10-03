/**
 * The CLI's own side of the online channel (spec 041 TB31): find a running app instance, read its secret
 * (same OS user, a plain file read - TB03), and call one Scope A operation against it over loopback HTTP.
 *
 * @module acryl-cli/host/online-client
 */

import {
  ONLINE_CALL_PATH,
  UiControlError,
  TOOLS_PATH,
  WORKERS_PATH,
  type GatewayCallResponse,
  type GatewayListResponse,
  type WorkerRequest,
  type WorkerResponse,
  type OnlineCallResponse,
  type UiErrorCode,
  type UiRequest,
  type UiResult,
} from 'acryl-agent-control'
import { listRunning, osHomeDirectory, readOnlineSecret, type RunningApp } from 'acryl-harness-runtime'

export class OnlineChannelError extends Error {}

/** The closed set of codes a {@link UiControlError} can carry, so a code read off the wire can be validated rather than cast. */
const UI_ERROR_CODES: readonly UiErrorCode[] = [
  'no-window', 'stale-ref', 'unknown-ref', 'sensitive', 'protected',
  'not-actionable', 'not-found', 'killed', 'timeout', 'aborted', 'unloaded', 'invalid',
]

/** Validates a wire-provided error code at this trust boundary instead of casting it (spec/CLAUDE.md 10.2). */
function toUiErrorCode(code: string): UiErrorCode {
  return (UI_ERROR_CODES as readonly string[]).includes(code) ? code as UiErrorCode : 'invalid'
}

/** Every running instance the online channel could possibly reach (a live process, discovered through the Registry). */
export function discoverInstances(): readonly RunningApp[] {
  return listRunning(osHomeDirectory())
}

/**
 * Choose the instance a command targets: the one named (by id or name), or the sole one running when none is
 * named, or a refusal naming the choices when the pick is ambiguous or nothing is running.
 * @throws OnlineChannelError
 */
export function pickInstance(target: string | undefined, instances: readonly RunningApp[] = discoverInstances()): RunningApp {
  if (target !== undefined) {
    const matches = instances.filter(instance => instance.id === target || instance.name === target)
    if (matches.length === 1) return matches[0]!
    if (matches.length > 1) throw new OnlineChannelError(`"${target}" is ambiguous: ${matches.map(instance => instance.id).join(', ')}`)
    throw new OnlineChannelError(`no running app named "${target}"; run \`acryl control list\` to see what is running`)
  }
  if (instances.length === 1) return instances[0]!
  if (instances.length === 0) throw new OnlineChannelError('no ACRYL app is running; start one, or name a running instance with --app')
  throw new OnlineChannelError(`more than one app is running: ${instances.map(instance => instance.id).join(', ')}; name one with --app`)
}

/**
 * Call one operation against a running instance.
 * @throws OnlineChannelError when the instance has no online channel to reach (not configured on, or too old),
 * or the HTTP call itself fails; UiControlError when the call reached the app and it refused or failed.
 */
export async function callOnlineChannel(instance: RunningApp, request: UiRequest, fetchImpl: typeof fetch = fetch): Promise<UiResult> {
  if (instance.port === undefined) throw new OnlineChannelError(`${instance.id} has no port recorded; it may be a CLI/TUI session with no page to control`)
  const secret = readOnlineSecret(instance.home)
  if (secret === undefined) {
    throw new OnlineChannelError(`${instance.id} has no online channel - set acryl-agent-control's "online" option to true in its profile and restart it`)
  }
  let response: Response
  try {
    response = await fetchImpl(`http://127.0.0.1:${String(instance.port)}${ONLINE_CALL_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
      body: JSON.stringify(request),
    })
  } catch (cause) {
    throw new OnlineChannelError(`could not reach ${instance.id} at port ${String(instance.port)}: ${cause instanceof Error ? cause.message : String(cause)}`)
  }
  if (response.status === 403) throw new OnlineChannelError(`${instance.id} refused this request (its secret rotated? try again)`)
  if (!response.ok) throw new OnlineChannelError(`${instance.id} answered with an unexpected status ${String(response.status)}`)
  const body = await response.json() as OnlineCallResponse
  if (body.ok) return body.result
  throw new UiControlError(toUiErrorCode(body.code), body.message)
}

/**
 * Call one agent-worker operation against a running instance (same secret and loopback rules as {@link callOnlineChannel}).
 * A refusal by the app is returned as the response, not thrown: it is the answer. A `send` can take as long as the agent works.
 * @throws OnlineChannelError when the instance has no online channel or cannot be reached.
 */
export async function callWorkers(instance: RunningApp, request: WorkerRequest, fetchImpl: typeof fetch = fetch): Promise<WorkerResponse> {
  if (instance.port === undefined) throw new OnlineChannelError(`${instance.id} has no port recorded; it may be a CLI/TUI session with no page to control`)
  const secret = readOnlineSecret(instance.home)
  if (secret === undefined) {
    throw new OnlineChannelError(`${instance.id} has no online channel - set acryl-agent-control's "online" option to true in its profile and restart it`)
  }
  let response: Response
  try {
    response = await fetchImpl(`http://127.0.0.1:${String(instance.port)}${WORKERS_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
      body: JSON.stringify(request),
    })
  } catch (cause) {
    throw new OnlineChannelError(`could not reach ${instance.id} at port ${String(instance.port)}: ${cause instanceof Error ? cause.message : String(cause)}`)
  }
  if (response.status === 403) throw new OnlineChannelError(`${instance.id} refused this request (its secret rotated? try again)`)
  if (response.status === 404) throw new OnlineChannelError(`${instance.id} has no agent workers (switched off, or an older app)`)
  if (response.status !== 200 && response.status !== 400) throw new OnlineChannelError(`${instance.id} answered with an unexpected status ${String(response.status)}`)
  return await response.json() as WorkerResponse
}

/**
 * List the extension tools of a running instance, or call one (`call` set). Same secret and loopback rules as {@link callOnlineChannel}; a refusal by the
 * app is returned as the response, not thrown.
 * @throws OnlineChannelError when the instance has no online channel or cannot be reached.
 */
export async function callToolGateway(
  instance: RunningApp,
  call?: { readonly name: string; readonly arguments: Record<string, unknown> },
  fetchImpl: typeof fetch = fetch,
): Promise<GatewayListResponse | GatewayCallResponse> {
  if (instance.port === undefined) throw new OnlineChannelError(`${instance.id} has no port recorded; it may be a CLI/TUI session with no page to control`)
  const secret = readOnlineSecret(instance.home)
  if (secret === undefined) {
    throw new OnlineChannelError(`${instance.id} has no online channel - set acryl-agent-control's "online" option to true in its profile and restart it`)
  }
  let response: Response
  try {
    response = await fetchImpl(`http://127.0.0.1:${String(instance.port)}${TOOLS_PATH}`, {
      method: call === undefined ? 'GET' : 'POST',
      headers: { authorization: `Bearer ${secret}`, ...(call === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(call === undefined ? {} : { body: JSON.stringify(call) }),
    })
  } catch (cause) {
    throw new OnlineChannelError(`could not reach ${instance.id} at port ${String(instance.port)}: ${cause instanceof Error ? cause.message : String(cause)}`)
  }
  if (response.status === 403) throw new OnlineChannelError(`${instance.id} refused this request (its secret rotated? try again)`)
  if (response.status === 404) throw new OnlineChannelError(`${instance.id} offers no tool gateway (switched off, or an older app)`)
  if (response.status !== 200 && response.status !== 400) throw new OnlineChannelError(`${instance.id} answered with an unexpected status ${String(response.status)}`)
  return await response.json() as GatewayListResponse | GatewayCallResponse
}
