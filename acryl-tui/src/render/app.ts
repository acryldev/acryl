import {
  InputRenderable,
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
  /** Optional body owned by the active terminal screen. */
  readonly body?: string
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
  const header = [
    'ACRYL',
    formatStatusRegion({
      mode: options.mode,
      ownerKind: options.ownerKind,
      profile: options.profile,
      generationId: options.generationId,
      model: options.model ?? 'unavailable',
      health: options.health ?? 'healthy',
    }),
    options.body ?? '',
  ].filter(line => line !== '').join('\n')
  const status = new TextRenderable(renderer, { content: header })
  const composer = new InputRenderable(renderer, { placeholder: 'Message ACRYL' })
  composer.on('enter', () => {
    if (composer.value.trim() === '') return
    status.content = `${header}\n\nMessage not sent: Harness session runtime is not connected.`
    composer.value = ''
  })
  renderer.root.add(status)
  renderer.root.add(composer)
  composer.focus()
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
