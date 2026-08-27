import type { ReactNode } from 'react'
import { render, type Instance } from 'ink'
import type { HostKind } from 'acryl-control'
import { AcrylInkApp } from './ink-app.tsx'

export type TuiHostMode = 'direct' | 'attached' | 'recovery'

type InkInstance = Pick<Instance, 'unmount' | 'waitUntilExit'>

export interface CreateAcrylRendererOptions {
  readonly renderApp?: (node: ReactNode) => InkInstance
  readonly mode: TuiHostMode
  readonly ownerKind: HostKind
  readonly profile: string
  readonly generationId: string
  readonly model?: string
  readonly health?: 'healthy' | 'degraded'
  readonly body?: string
}

export interface AcrylRenderer {
  readonly renderer: InkInstance
  destroy(): void
}

/** Mount the ACRYL terminal projection in an owned React Ink renderer. */
export function createAcrylRenderer(options: CreateAcrylRendererOptions): AcrylRenderer {
  const renderer = (options.renderApp ?? render)(
    <AcrylInkApp
      profile={options.profile}
      ownerMode={options.mode === 'attached' ? 'attached' : 'owner'}
      runtimeState={options.health === 'degraded' ? 'unavailable' : 'ready'}
    />,
  )
  let destroyed = false
  return {
    renderer,
    destroy() {
      if (destroyed) return
      destroyed = true
      renderer.unmount()
    },
  }
}
