/**
 * Cordis Host plugin: Agent Control tools for the ACRYL window (spec 041), for every surface that has a page.
 *
 * The tools live here, the DOM lives in the page. The page connects over a same-origin WebSocket
 * (`/api/acryl-agent-control/channel`) and the tools send it calls. One effect owns the channel, the route, the
 * tools and the approval policy; disposing the plugin closes the channel and settles every pending call.
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-tools'
import { createApprovalPolicy } from './host/approval.ts'
import { AuditLog, auditPath } from './host/audit.ts'
import { createAuditRequestHandler, UI_CONTROL_AUDIT_PATH } from './host/audit-route.ts'
import { UiChannel } from './host/channel.ts'
import { parseConfig } from './host/config.ts'
import { ONLINE_CALL_PATH, handleOnlineCallRequest } from './host/online-route.ts'
import { removeOnlineSecret, writeOnlineSecret } from './host/online-secret.ts'
import { createUiControlStream, UI_CONTROL_CHANNEL_PATH } from './host/stream.ts'
import { RefDirectory, registerUiTools, runOnlineCall } from './host/tools.ts'
import { WORKERS_PATH } from './workers-contract.ts'
import { handleWorkersRequest } from './host/workers/route.ts'
import { mountWorkers } from './host/workers/service.ts'

export const name = 'acryl-agent-control'
/**
 * The part of the runtime's `appInstance` service ACRYL plugins read (a separated interface: plugins do not import the runtime). Every plugin declares
 * exactly this shape, so the Context augmentations agree in any program that loads several of them.
 */
interface AppInstanceService {
  readonly home: string
  readonly dshHome: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    appInstance: AppInstanceService
  }
}

export const inject = ['webServer', 'tools', 'appInstance']

export function apply(ctx: Context, rawConfig?: unknown): void {
  const config = parseConfig(rawConfig)
  const origin = `http://127.0.0.1:${String(ctx.webServer.port)}`
  const reportError = (operation: string, cause: unknown): void => {
    ctx.logger?.error?.(`acryl-agent-control: failed to ${operation}: ${cause instanceof Error ? cause.message : String(cause)}`)
  }
  // Bring-your-own agents (Claude Code): mounted as children of this Fiber, so they end with it.
  const workers = config.workers.enabled ? mountWorkers(ctx, config.workers) : undefined
  ctx.effect(() => {
    const channel = new UiChannel()
    const stream = createUiControlStream(channel, origin)
    const audit = new AuditLog(config.auditLog ?? auditPath(ctx.appInstance.home))
    const refs = new RefDirectory()
    const releases: Array<() => void> = []
    let onlineSecret: string | undefined
    try {
      releases.push(ctx.webServer.registerUpgrade({
        path: UI_CONTROL_CHANNEL_PATH,
        handler: (req, socket, head) => { stream.handleUpgrade(req, socket, head) },
      }))
      const handleAudit = createAuditRequestHandler(audit)
      releases.push(ctx.webServer.register({ kind: 'exact', path: UI_CONTROL_AUDIT_PATH, handler: (req, res) => { handleAudit(req, res, origin) } }))
      if (workers !== undefined) {
        releases.push(ctx.webServer.register({
          kind: 'exact',
          path: WORKERS_PATH,
          handler: (req, res) => { void handleWorkersRequest(req, res, origin, onlineSecret, workers, reportError) },
        }))
      }
      releases.push(registerUiTools(ctx, { channel, audit, refs, approval: config.approval === 'none' ? 'none' : 'asked' }))
      releases.push(ctx.on('tools/pre-execute', createApprovalPolicy(ctx, refs, config.approval)))
      if (config.online) {
        // TB30: the outside operator's channel, loopback-only and secret-gated (TB03) - the secret is this
        // run's alone, written once at startup and removed on shutdown, never persisted across restarts.
        onlineSecret = writeOnlineSecret(ctx.appInstance.home)
        const secret = onlineSecret
        releases.push(ctx.webServer.register({
          kind: 'exact',
          path: ONLINE_CALL_PATH,
          handler: (req, res) => { void handleOnlineCallRequest(req, res, secret, (request, signal) => runOnlineCall({ channel, audit, refs }, request, signal), reportError) },
        }))
      }
    } catch (cause) {
      for (const release of releases.reverse()) release()
      if (onlineSecret !== undefined) removeOnlineSecret(ctx.appInstance.home)
      stream.close()
      channel.close()
      throw cause
    }
    return () => {
      for (const release of releases.reverse()) release()
      if (onlineSecret !== undefined) removeOnlineSecret(ctx.appInstance.home)
      stream.close()
      channel.close()
    }
  }, 'acryl-agent-control: page channel, tools and approval policy')
}

export { UI_CONTROL_CHANNEL_PATH } from './host/stream.ts'
export { WORKERS_PATH, WORKER_PROVIDERS, WorkerRequestError, parseWorkerRequest, type WorkerProvider, type WorkerRequest, type WorkerResponse } from './workers-contract.ts'
export { UI_CONTROL_AUDIT_PATH } from './host/audit-route.ts'
export { ONLINE_CALL_PATH, type OnlineCallResponse } from './host/online-route.ts'
export {
  UI_OPS,
  UiControlError,
  parseUiRequest,
  type UiErrorCode,
  type UiOp,
  type UiRequest,
  type UiResult,
} from './contract.ts'
