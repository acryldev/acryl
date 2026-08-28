/** Start one normal local Harness runtime for this terminal surface. */

import { randomUUID } from 'node:crypto'
import { bootAcrylHarnessProfile } from 'acryl-harness-runtime'
import type { Context } from '@deepseek-ai/cordis'

export interface StartDirectHostOptions {
  readonly profile: string
  /** Retained for CLI compatibility. Local launch does not create control state. */
  readonly stateDirectory: string
  readonly generationId?: string
}

export interface DirectHost {
  readonly ctx: Context
  readonly runtimeState: 'ready' | 'unavailable'
  readonly profile: string
  readonly generationId: string
  dispose(): Promise<void>
}

/**
 * A local surface owns its normal DSH/Cordis root. Durable DSH sessions, not
 * `.acryl/control` experiments, provide continuity across later launches.
 */
export async function startDirectHost(options: StartDirectHostOptions): Promise<DirectHost> {
  if (options.profile.trim() === '') throw new Error('ACRYL direct host profile must not be empty')
  const runtime = await bootAcrylHarnessProfile({ profile: options.profile })
  const ctx = runtime.ctx
  let disposed = false
  return Object.freeze({
    ctx,
    profile: options.profile,
    generationId: options.generationId ?? randomUUID(),
    runtimeState: ctx.get('sessions') !== undefined && ctx.get('agents') !== undefined ? 'ready' : 'unavailable',
    async dispose(): Promise<void> {
      if (disposed) return
      disposed = true
      await runtime.dispose()
    },
  })
}
