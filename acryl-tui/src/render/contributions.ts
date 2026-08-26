import { type Context, Service } from '@deepseek-ai/cordis'
import type { ControlCapability } from 'acryl-control'

export type TuiContributionKind =
  | 'screen'
  | 'command'
  | 'keybinding'
  | 'status'
  | 'modal'
  | 'renderer'

export interface TuiContribution {
  readonly id: string
  readonly kind: TuiContributionKind
  readonly label: string
  readonly priority: number
  readonly requiredCapabilities: readonly ControlCapability[]
}

export interface TuiContributions {
  register(owner: Context, contribution: TuiContribution): void
  list(): readonly TuiContribution[]
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    tuiContributions: TuiContributions
  }
}

export class TuiContributionRegistry extends Service implements TuiContributions {
  private readonly contributions = new Map<string, TuiContribution>()

  constructor(ctx: Context) {
    super(ctx, 'tuiContributions')
  }

  register(owner: Context, contribution: TuiContribution): void {
    if (contribution.id.trim() === '') throw new Error('TUI contribution id must not be empty')
    if (!Number.isFinite(contribution.priority)) {
      throw new Error('TUI contribution priority must be finite')
    }
    const owned = Object.freeze({
      ...contribution,
      requiredCapabilities: Object.freeze([...contribution.requiredCapabilities]),
    })
    owner.effect(() => {
      if (this.contributions.has(owned.id)) {
        throw new Error(`duplicate TUI contribution id: ${owned.id}`)
      }
      this.contributions.set(owned.id, owned)
      return () => {
        if (this.contributions.get(owned.id) === owned) this.contributions.delete(owned.id)
      }
    }, `acryl-tui: contribution ${owned.id}`)
  }

  list(): readonly TuiContribution[] {
    return [...this.contributions.values()].sort((left, right) => {
      return left.priority - right.priority || left.id.localeCompare(right.id)
    })
  }
}

export default TuiContributionRegistry
