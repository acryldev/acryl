/**
 * `createDefaultModelAdoption`: after a sign-in, make the signed-in provider the default for new sessions when the
 * current default cannot answer (its provider has no credential or is not live).
 *
 * Without this, a first-run user who signs into Claude still gets new sessions on the composition's default (DeepSeek),
 * and the first message fails. A default whose provider works is never replaced: the user's own choice wins.
 *
 * Framework-free like the rest of this folder: plain ports, no Cordis `Context`.
 */
import type { DefaultModelAdoptionPort } from '../authorization/types.ts'

export interface DefaultModelSelection {
  readonly provider: string
  readonly model: string
}

export interface DefaultModelAdoptionPorts {
  /** `ctx.agentDefaultModel` (`dsh-agent-default-model`). */
  readonly defaultModel: {
    currentSelection(): DefaultModelSelection
    saveSelection(next: DefaultModelSelection): Promise<void>
  }
  /** Whether a provider route can answer a request now: live in `ctx.llm` and holding a credential. */
  readonly isUsable: (provider: string) => Promise<boolean>
  /** The route's models in adapter order (`ctx.llm.listModels`). */
  readonly listModels: (provider: string) => Promise<readonly { readonly id: string }[]>
}

/**
 * The model a new session starts on for a provider ACRYL features on its sign-in screen, most preferred first. The
 * installed catalog lists models alphabetically, so its first entry is no recommendation; a provider absent here (or
 * whose preferred ids a catalog update removed) starts on that first entry instead.
 */
export const STARTING_MODELS: Readonly<Record<string, readonly string[]>> = {
  anthropic: ['claude-sonnet-5-5', 'claude-sonnet-5', 'claude-sonnet-4-6'],
  openai: ['gpt-5.5', 'gpt-5.4'],
  'openai-codex': ['gpt-5.5'],
  deepseek: ['deepseek-v4-pro', 'deepseek-flash'],
}

/** The model to start on from a route's catalog, or `undefined` when the route lists none. */
export function startingModel(provider: string, models: readonly { readonly id: string }[]): string | undefined {
  const offered = new Set(models.map(model => model.id))
  return (STARTING_MODELS[provider] ?? []).find(id => offered.has(id)) ?? models[0]?.id
}

export function createDefaultModelAdoption(ports: DefaultModelAdoptionPorts): DefaultModelAdoptionPort {
  return {
    async adoptIfDefaultUnusable(provider) {
      const current = ports.defaultModel.currentSelection()
      if (current.provider === provider) return
      if (await ports.isUsable(current.provider)) return
      const model = startingModel(provider, await ports.listModels(provider))
      if (model === undefined) return
      await ports.defaultModel.saveSelection({ provider, model })
    },
  }
}
