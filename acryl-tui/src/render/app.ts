import {
  TextRenderable,
  createCliRenderer,
  type CliRenderer,
  type CliRendererConfig,
} from '@opentui/core'
import type { HostKind } from 'acryl-control'
import { formatStatusRegion, type TuiHostHealth } from './status.ts'

export type TuiHostMode = 'direct' | 'attached' | 'recovery'

export interface CreateAcrylRendererOptions {
  readonly createRenderer?: (config: CliRendererConfig) => Promise<CliRenderer>
  readonly mode: TuiHostMode
  readonly ownerKind: HostKind
  readonly profile: string
  readonly generationId: string
  readonly model?: string
  readonly health?: TuiHostHealth
}

export interface AcrylRenderer {
  readonly renderer: CliRenderer
  destroy(): void
}

export async function createAcrylRenderer(
  options: CreateAcrylRendererOptions,
): Promise<AcrylRenderer> {
  const renderer = await (options.createRenderer ?? createCliRenderer)({
    exitOnCtrlC: true,
    clearOnShutdown: true,
    screenMode: 'alternate-screen',
  })
  renderer.root.add(new TextRenderable(renderer, {
    content: [
      'ACRYL',
      formatStatusRegion({
        mode: options.mode,
        ownerKind: options.ownerKind,
        profile: options.profile,
        generationId: options.generationId,
        model: options.model ?? 'unavailable',
        health: options.health ?? 'healthy',
      }),
    ].join('\n'),
  }))
  let destroyed = false
  return {
    renderer,
    destroy() {
      if (destroyed) return
      destroyed = true
      renderer.destroy()
    },
  }
}
