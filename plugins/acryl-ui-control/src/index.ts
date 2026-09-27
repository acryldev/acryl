/**
 * Cordis Host plugin: Agent Control tools for the ACRYL window (spec 041), for every surface that has a page.
 *
 * The tools live here, the DOM lives in the page. The page connects over a same-origin WebSocket
 * (`/api/acryl-ui-control/channel`) and the tools send it calls. One effect owns the channel, the route, the
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
import { createUiControlStream, UI_CONTROL_CHANNEL_PATH } from './host/stream.ts'
import { RefDirectory, registerUiTools } from './host/tools.ts'

export const name = 'acryl-ui-control'
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
  ctx.effect(() => {
    const channel = new UiChannel()
    const stream = createUiControlStream(channel, origin)
    const audit = new AuditLog(config.auditLog ?? auditPath(ctx.appInstance.home))
    const refs = new RefDirectory()
    const releases: Array<() => void> = []
    try {
      releases.push(ctx.webServer.registerUpgrade({
        path: UI_CONTROL_CHANNEL_PATH,
        handler: (req, socket, head) => { stream.handleUpgrade(req, socket, head) },
      }))
      const handleAudit = createAuditRequestHandler(audit)
      releases.push(ctx.webServer.register({ kind: 'exact', path: UI_CONTROL_AUDIT_PATH, handler: (req, res) => { handleAudit(req, res, origin) } }))
      releases.push(registerUiTools(ctx, { channel, audit, refs, approval: config.approval === 'none' ? 'none' : 'asked' }))
      releases.push(ctx.on('tools/pre-execute', createApprovalPolicy(refs, config.approval)))
    } catch (cause) {
      for (const release of releases.reverse()) release()
      stream.close()
      channel.close()
      throw cause
    }
    return () => {
      for (const release of releases.reverse()) release()
      stream.close()
      channel.close()
    }
  }, 'acryl-ui-control: page channel, tools and approval policy')
}

export { UI_CONTROL_CHANNEL_PATH } from './host/stream.ts'
export { UI_CONTROL_AUDIT_PATH } from './host/audit-route.ts'
export { UiControlError } from './contract.ts'
