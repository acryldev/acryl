/**
 * Agent workers on the Host: mounts `acrAgentControl` and the `claude` provider with its stream-json transport as children of this plugin's
 * Fiber (they end with it, and the transport ends every process it opened), and runs one {@link WorkerRequest} against them.
 */

import { randomBytes } from 'node:crypto'
import { statSync } from 'node:fs'
import { basename, isAbsolute } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import {
  AcrAgentControlError,
  AcrAgentControlService,
  PROVIDER_CAPABILITIES,
  claudeProvider,
  createClaudeStreamTransport,
  type AcrAgentControl,
} from 'acryl-control'
import type { WorkerRequest, WorkerResponse } from '../../workers-contract.ts'

export interface WorkersConfig {
  readonly enabled: boolean
  readonly claude: { readonly command?: string; readonly args?: readonly string[] }
}

export interface Workers {
  run(request: WorkerRequest, signal?: AbortSignal): Promise<WorkerResponse>
}

function refusal(code: string, message: string): WorkerResponse {
  return { ok: false, code, message }
}

function folderError(cwd: string): string | undefined {
  if (!isAbsolute(cwd)) return `cwd must be an absolute path (got "${cwd}")`
  try {
    return statSync(cwd).isDirectory() ? undefined : `${cwd} is not a folder`
  } catch {
    return `${cwd} does not exist`
  }
}

/** Mount the service and the Claude provider on `ctx`; the returned runner reads the service when called, never captures it. */
export function mountWorkers(ctx: Context, config: WorkersConfig): Workers {
  const transport = createClaudeStreamTransport({
    ...(config.claude.command === undefined ? {} : { command: config.claude.command }),
    ...(config.claude.args === undefined ? {} : { args: config.claude.args }),
  })
  ctx.plugin(AcrAgentControlService)
  ctx.plugin(claudeProvider(transport))
  const control = (): AcrAgentControl | undefined => (ctx as unknown as { get(name: string): AcrAgentControl | undefined }).get('acrAgentControl')

  return {
    async run(request, signal) {
      const service = control()
      if (service === undefined) return refusal('not-ready', 'Agent workers are still starting.')
      try {
        switch (request.op) {
          case 'list':
            return { ok: true, result: await service.snapshot() }
          case 'attach': {
            const problem = folderError(request.cwd)
            if (problem !== undefined) return refusal('invalid', problem)
            const profile = PROVIDER_CAPABILITIES.claude
            const binding = await service.attach({
              workerId: request.workerId ?? `claude-${randomBytes(4).toString('hex')}`,
              providerId: profile.kind,
              workspace: { identity: basename(request.cwd), cwd: request.cwd },
              capabilities: profile.capabilities,
              fidelity: profile.fidelity,
              ...(request.resume === undefined ? {} : { providerSessionRef: request.resume }),
            })
            return { ok: true, result: binding }
          }
          case 'send':
            return { ok: true, result: (await service.dispatch(request.workerId, { kind: 'send', payload: request.text }, signal)).result }
          case 'cancel':
            return { ok: true, result: (await service.dispatch(request.workerId, { kind: 'cancel', payload: null })).result }
          case 'stop':
            return { ok: true, result: (await service.dispatch(request.workerId, { kind: 'stop', payload: null })).result }
        }
      } catch (cause) {
        if (cause instanceof AcrAgentControlError) return refusal(cause.code, cause.message)
        throw cause
      }
    },
  }
}
