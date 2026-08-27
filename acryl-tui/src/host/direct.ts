/** Standalone host composition for an ACRYL profile with no existing owner. */

import { createHash, randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { bootAcrylHarnessProfile } from 'acryl-harness-runtime'
import {
  ACRYL_CONTROL_PROTOCOL_VERSION,
  Context,
  AcrAgentControlService,
  AcrControlProtocolService,
  AcrProfileOwnershipService,
  AcrRuntimeArchitectureService,
  type ControlEndpoint,
} from 'acryl-control'

export interface StartDirectHostOptions {
  readonly profile: string
  readonly stateDirectory: string
  readonly hostId?: string
  readonly generationId?: string
  readonly endpoint?: ControlEndpoint
}

export interface DirectHost {
  readonly ctx: Context
  readonly profile: string
  readonly generationId: string
  readonly endpoint: ControlEndpoint
  dispose(): Promise<void>
}

export class DirectHostAlreadyOwnedError extends Error {
  constructor(readonly profile: string, readonly endpoint: ControlEndpoint) {
    super(`ACRYL profile ${profile} is already owned at ${endpoint.address}.`)
    this.name = 'DirectHostAlreadyOwnedError'
  }
}

function assertControlContext(value: unknown): asserts value is Context {
  if (
    value === null
    || typeof value !== 'object'
    || !('plugin' in value)
    || typeof value.plugin !== 'function'
    || !('fiber' in value)
  ) {
    throw new Error('ACRYL Harness boot did not return a usable Cordis root')
  }
}

function defaultEndpoint(
  profile: string,
  generationId: string,
  stateDirectory: string,
): ControlEndpoint {
  if (process.platform === 'win32') {
    const suffix = createHash('sha256').update(`${profile}:${generationId}`).digest('hex').slice(0, 24)
    return {
      kind: 'named-pipe',
      address: `\\\\.\\pipe\\acryl-${suffix}`,
      protocolVersion: ACRYL_CONTROL_PROTOCOL_VERSION,
    }
  }
  const suffix = createHash('sha256').update(`${profile}:${generationId}`).digest('hex').slice(0, 24)
  return {
    kind: 'unix',
    address: join(stateDirectory, `acryl-${suffix}.sock`),
    protocolVersion: ACRYL_CONTROL_PROTOCOL_VERSION,
  }
}

/**
 * Boot the direct-mode control composition after acquiring exclusive ownership.
 * Attach and recovery modes deliberately remain separate hosts, so an attached
 * lease never gets a second writable Cordis context here.
 */
export async function startDirectHost(options: StartDirectHostOptions): Promise<DirectHost> {
  if (options.profile.trim() === '') throw new Error('ACRYL direct host profile must not be empty')
  if (options.stateDirectory.trim() === '') throw new Error('ACRYL direct host state directory must not be empty')

  const profile = options.profile
  const generationId = options.generationId ?? randomUUID()
  const hostId = options.hostId ?? randomUUID()
  const endpoint = options.endpoint ?? defaultEndpoint(profile, generationId, options.stateDirectory)
  let runtime: Awaited<ReturnType<typeof bootAcrylHarnessProfile>>
  try {
    runtime = await bootAcrylHarnessProfile({
      profile,
      prepare: async ctx => {
        assertControlContext(ctx)
        const ownership = ctx.plugin(AcrProfileOwnershipService, {
          stateDirectory: options.stateDirectory,
          request: {
            profileKey: profile,
            host: {
              hostId,
              kind: 'tui',
              generationId,
              pid: process.pid,
              startedAt: new Date().toISOString(),
              protocolVersion: ACRYL_CONTROL_PROTOCOL_VERSION,
              status: 'ready',
            },
            endpoint,
          },
        })
        await ownership
        const acquisition = ctx.acrProfileOwnership.current
        if (acquisition.kind === 'attached') {
          throw new DirectHostAlreadyOwnedError(profile, acquisition.lease.endpoint)
        }

        const architecture = ctx.plugin(AcrRuntimeArchitectureService)
        await architecture

        const agentControl = ctx.plugin(AcrAgentControlService)
        await agentControl

        const protocol = ctx.plugin(AcrControlProtocolService, {
          endpoint,
          generationId,
          capabilities: ['host.status', 'architecture.inspect'],
          handle: async (operation, payload) => {
            switch (operation) {
              case 'host.status':
                return {
                  profile,
                  generationId,
                  endpoint,
                  owner: ctx.acrProfileOwnership.current,
                  capabilities: ctx.acrControlProtocol.capabilities,
                }
              case 'architecture.inspect':
                return ctx.acrRuntimeArchitecture.snapshot('host')
              default:
                throw new Error(`unsupported direct-host operation ${operation}: ${String(payload)}`)
            }
          },
        })
        await protocol
      },
    })
  } catch (cause) {
    if (cause instanceof Error && cause.cause instanceof DirectHostAlreadyOwnedError) {
      throw cause.cause
    }
    throw cause
  }
  assertControlContext(runtime.ctx)
  const ctx = runtime.ctx

  let disposed = false
  return Object.freeze({
    ctx,
    profile,
    generationId,
    endpoint,
    async dispose() {
      if (disposed) return
      disposed = true
      await runtime.dispose()
    },
  })
}
