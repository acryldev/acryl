import type { HostKind } from 'acryl-control'
import type { TuiHostMode } from './app.ts'

export type TuiHostHealth = 'healthy' | 'degraded' | 'recovering' | 'failed'

export interface TuiStatusRegion {
  readonly mode: TuiHostMode
  readonly ownerKind: HostKind
  readonly profile: string
  readonly generationId: string
  readonly model: string
  readonly health: TuiHostHealth
}

function visible(value: string, field: string): string {
  if (value.trim() === '') throw new Error(`ACRYL status ${field} must not be empty`)
  return value
}

/** Stable, copyable status projection for the terminal host header. */
export function formatStatusRegion(status: TuiStatusRegion): string {
  return [
    `mode: ${status.mode}`,
    `owner: ${status.ownerKind}`,
    `profile: ${visible(status.profile, 'profile')}`,
    `generation: ${visible(status.generationId, 'generation')}`,
    `model: ${visible(status.model, 'model')}`,
    `health: ${status.health}`,
  ].join(' | ')
}
