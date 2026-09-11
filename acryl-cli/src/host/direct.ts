/** Start one normal local Harness runtime for this terminal surface. */

import { randomUUID } from 'node:crypto'
import {
  createAcrylEngineHost,
  createDshEngineDefinition,
  type AcrylEngineHost,
} from 'acryl-harness-runtime'
import type { Context } from '@deepseek-ai/cordis'

export interface StartDirectHostOptions {
  readonly profile: string
  readonly generationId?: string
}

export interface DirectHost {
  readonly ctx: Context
  readonly runtimeState: 'ready' | 'unavailable'
  readonly profile: string
  /** The engine Loader row currently mounted beneath this host's Cordis root. */
  readonly engine: string
  readonly generationId: string
  dispose(): Promise<void>
}

/** The engine a launch selects. `--engine` selection is a later phase; `dsh` is the default. */
const DEFAULT_ENGINE = 'dsh'

/**
 * A local surface owns its normal DSH/Cordis root. Durable DSH sessions, not
 * `.acryl/control` experiments, provide continuity across later launches.
 *
 * The root belongs to `createAcrylEngineHost`, and the selected engine is one
 * Loader row beneath it - so a later `select()` swaps the runtime without ever
 * creating a second Cordis root (spec 028 / M9). The `dsh` engine composes the
 * identical pinned profile `bootAcrylHarnessProfile` used to boot directly
 * (SC-004), so this is a boundary change, not a behavior change.
 */
export async function startDirectHost(options: StartDirectHostOptions): Promise<DirectHost> {
  if (options.profile.trim() === '') throw new Error('ACRYL direct host profile must not be empty')
  const host: AcrylEngineHost = await createAcrylEngineHost({
    engines: [createDshEngineDefinition(options.profile)],
    initialEngine: DEFAULT_ENGINE,
  })
  const ctx = host.ctx
  let disposed = false
  return Object.freeze({
    ctx,
    profile: options.profile,
    engine: host.currentEngine(),
    generationId: options.generationId ?? randomUUID(),
    runtimeState: ctx.get('sessions') !== undefined && ctx.get('agents') !== undefined ? 'ready' : 'unavailable',
    async dispose(): Promise<void> {
      if (disposed) return
      disposed = true
      await host.dispose()
    },
  })
}
