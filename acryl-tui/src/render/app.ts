import {
  TextRenderable,
  createCliRenderer,
  type CliRenderer,
  type CliRendererConfig,
} from '@opentui/core'
import type { HostKind } from 'acryl-control'

export type TuiHostMode = 'direct' | 'attached' | 'recovery'

export interface CreateAcrylRendererOptions {
  readonly createRenderer?: (config: CliRendererConfig) => Promise<CliRenderer>
  readonly mode: TuiHostMode
  readonly ownerKind: HostKind
  readonly profile: string
  readonly generationId: string
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
      `mode: ${options.mode}`,
      `owner: ${options.ownerKind}`,
      `profile: ${options.profile}`,
      `generation: ${options.generationId}`,
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
