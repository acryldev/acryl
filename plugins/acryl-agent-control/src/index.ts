/**
 * Cordis Host plugin: Agent Control tools for the ACRYL window (spec 041), for every surface that has a page.
 *
 * The tools live here, the DOM lives in the page. The page channel is `acryl-door`'s (spec 049 slice 9): the page keeps an event stream
 * open (`/api/acryl-agent-control/channel`), the tools send it calls down that stream, and the page posts the answers back. This plugin
 * is the DSH face over the door's core: its tools, approval policy, workers and MCP gateway. One effect owns the channel, the tools, the
 * approval policy and the secret; the HTTP routes are one app mounted on the router after it, so an unload ends their requests (the
 * pages' streams among them) first and then closes the channel and settles every pending call.
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from 'acryl-control'
import type { Acryl } from 'acrylblends'
import { AuditLog, auditPath, pageChannelRoutes, UiChannel } from 'acrylblends/door/host'
import type {} from 'acrylblends/cordis/router'
import type {} from 'acrylblends/cordis/router-http'
import { createApprovalPolicy } from './host/approval.ts'
import { auditRoutes } from './host/audit-route.ts'
import { parseConfig } from './host/config.ts'
import { AGENT_CONTROL_API_PREFIX, privateApi } from './host/http.ts'
import { onlineCallRoutes } from './host/online-route.ts'
import { removeOnlineSecret, writeOnlineSecret } from './host/online-secret.ts'
import { RefDirectory, registerUiTools, runOnlineCall } from './host/tools.ts'
import { MCP_PATH } from './tools-contract.ts'
import { createToolsGateway } from './host/tools-gateway/gateway.ts'
import { mcpRoutes, toolsRoutes } from './host/tools-gateway/routes.ts'
import { docsRootFromLookup, removeWorkerMcpConfig, workerMcpArgs, writeWorkerMcpConfig } from './host/tools-gateway/worker-config.ts'
import { workersRoutes } from './host/workers/route.ts'
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

export const inject = ['acrylWeb', 'acrylTools', 'appInstance', 'router', 'routerHttp']

export function apply(ctx: Context, rawConfig?: unknown): void {
  const config = parseConfig(rawConfig)
  const origin = `http://127.0.0.1:${String(ctx.acrylWeb.port)}`
  const reportError = (operation: string, cause: unknown): void => {
    ctx.logger?.error?.(`acryl-agent-control: failed to ${operation}: ${cause instanceof Error ? cause.message : String(cause)}`)
  }
  // Bring-your-own agents (Claude Code): mounted as children of this Fiber, so they end with it.
  // The MCP config a Claude worker starts with exists only while the gateway is up (it names this Host and carries its secret).
  let workerMcpConfig: string | undefined
  const gateway = config.tools.enabled ? createToolsGateway(ctx, config.tools.expose) : undefined
  const workerArgs = async (): Promise<readonly string[]> => {
    if (workerMcpConfig === undefined) return []
    // Read access to the extension docs the lookup tool points at, so the worker can follow them.
    const lookup = await gateway?.call('acryl_plugin_lookup', { topic: 'tool' }, new AbortController().signal).catch(() => undefined)
    const docs = lookup?.ok === true ? docsRootFromLookup(lookup.text) : undefined
    return [...workerMcpArgs(workerMcpConfig), ...(docs === undefined ? [] : ['--add-dir', docs])]
  }
  const workers = config.workers.enabled ? mountWorkers(ctx, config.workers, workerArgs) : undefined
  // The routes are built inside the effect, where the audit log, the channel and the secret exist, and mounted after it.
  const built: { api?: Acryl } = {}
  ctx.effect(() => {
    const channel = new UiChannel()
    const audit = new AuditLog(config.auditLog ?? auditPath(ctx.appInstance.home))
    const refs = new RefDirectory()
    const releases: Array<() => void> = []
    let onlineSecret: string | undefined
    try {
      // The Host serves its pages from 127.0.0.1 only, so that is the one hostname the channel accepts.
      const routes: Acryl[] = [pageChannelRoutes(channel, { prefix: AGENT_CONTROL_API_PREFIX, hostnames: ['127.0.0.1'] }), auditRoutes(audit)]
      if (workers !== undefined) routes.push(workersRoutes(() => onlineSecret, workers, reportError))
      releases.push(registerUiTools(ctx, { channel, audit, refs, approval: config.approval === 'none' ? 'none' : 'asked' }))
      releases.push(ctx.acrylTools.policy(createApprovalPolicy(ctx, refs, config.approval)))
      if (config.online) {
        // TB30: the outside operator's channel, loopback-only and secret-gated (TB03) - the secret is this
        // run's alone, written once at startup and removed on shutdown, never persisted across restarts.
        onlineSecret = writeOnlineSecret(ctx.appInstance.home)
        const secret = onlineSecret
        if (gateway !== undefined) {
          routes.push(toolsRoutes(secret, gateway, reportError), mcpRoutes(secret, gateway, reportError))
          workerMcpConfig = writeWorkerMcpConfig(ctx.appInstance.home, `${origin}${MCP_PATH}`, secret)
          releases.push(() => { workerMcpConfig = undefined; removeWorkerMcpConfig(ctx.appInstance.home) })
        }
        routes.push(onlineCallRoutes(secret, (request, signal) => runOnlineCall({ channel, audit, refs }, request, signal), reportError))
      }
      built.api = privateApi(...routes)
    } catch (cause) {
      for (const release of releases.reverse()) release()
      if (onlineSecret !== undefined) removeOnlineSecret(ctx.appInstance.home)
      channel.close()
      throw cause
    }
    return () => {
      for (const release of releases.reverse()) release()
      if (onlineSecret !== undefined) removeOnlineSecret(ctx.appInstance.home)
      channel.close()
    }
  }, 'acryl-agent-control: page channel, tools, approval policy and secret')
  if (built.api === undefined) throw new Error('acryl-agent-control: the routes were not built')
  // After the effect, so an unload removes the mount first: its in-flight calls end before the secret goes and the channel closes.
  ctx.router.route('/', built.api)
  ctx.routerHttp.mount(AGENT_CONTROL_API_PREFIX)
}

/** The page's event stream; it answers by POST to `${UI_CONTROL_CHANNEL_PATH}/answer`. */
export const UI_CONTROL_CHANNEL_PATH = `${AGENT_CONTROL_API_PREFIX}/channel`
export { DEFAULT_EXPOSED_TOOLS, MCP_PATH, TOOLS_PATH, GatewayRequestError, parseGatewayCall, type GatewayCallResponse, type GatewayListResponse, type GatewayTool } from './tools-contract.ts'
export { WORKERS_PATH, WORKER_PROVIDERS, WorkerRequestError, parseWorkerRequest, type WorkerProvider, type WorkerRequest, type WorkerResponse } from './workers-contract.ts'
export { UI_CONTROL_AUDIT_PATH } from './host/audit-route.ts'
export { ONLINE_CALL_PATH, type OnlineCallResponse } from './host/online-route.ts'
export {
  UI_ERROR_CODES,
  UI_OPS,
  UiControlError,
  parseUiRequest,
  type UiErrorCode,
  type UiOp,
  type UiRequest,
  type UiResult,
} from 'acrylblends/door/protocol'
