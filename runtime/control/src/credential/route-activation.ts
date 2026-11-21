/**
 * `createRouteActivation`: make a provider usable right after a sign-in.
 *
 * A sign-in only ever writes a credential (the OAuth grant or the typed API key); it never touches `ctx.settings`.
 * `dsh-llm-pi-ai` registers a route as live only once its settings section names it (an empty profile, which means "use
 * the installed catalog's defaults", counts), so without this a successful sign-in leaves the provider credentialed but
 * absent from `ctx.llm`'s live directory and unusable. A route with no settings profile gets one named for the provider
 * ({@link ROUTE_NAMES}: the picker otherwise shows the bare route key, `anthropic`). A profile the user configured
 * (custom base URL, model overrides, display name) is kept, with one repair: an `apiKeyEnv` naming a key that is not
 * stored is removed, because `dsh-llm-pi-ai` resolves a named reference before the sign-in's record and fails the request
 * with `MISSING_CREDENTIAL`, so the credential just stored would never be used. A named key that is stored stays and
 * keeps winning, as the person chose it.
 *
 * Framework-free like the rest of this folder: plain ports, no Cordis `Context`.
 */
import type { CredentialProjectionConfigurableProvider, CredentialProjectionSettingsPort } from './projection.ts'
import type { RouteActivationPort } from '../authorization/types.ts'

/**
 * The name a route made by a sign-in is shown under, for the providers ACRYL features on its sign-in screen: the models
 * people know, not the company's route key. A provider absent here keeps the harness default (its route key).
 */
export const ROUTE_NAMES: Readonly<Record<string, string>> = {
  anthropic: 'Claude',
  openai: 'OpenAI',
  'openai-codex': 'ChatGPT',
  'github-copilot': 'GitHub Copilot',
}

/** One edit of a settings section by path (`ctx.settings.mutate`), the only way to remove a stored field. */
export type RouteActivationPathOp =
  | { readonly op: 'set'; readonly path: readonly string[]; readonly value: unknown }
  | { readonly op: 'unset'; readonly path: readonly string[] }

export interface RouteActivationSettingsPort extends CredentialProjectionSettingsPort {
  update(ns: string, patch: Record<string, unknown>, expectedRevision?: number): Promise<unknown>
  mutate(ns: string, ops: readonly RouteActivationPathOp[], expectedRevision?: number): Promise<unknown>
}

export interface RouteActivationPorts {
  readonly settings: RouteActivationSettingsPort
  readonly llm: { listConfigurableProviders(): readonly CredentialProjectionConfigurableProvider[] }
  /** Whether a credential reference (an `apiKeyEnv` name) holds a value (`ctx.credentials.describe`). */
  readonly credentials: { describe(ref: string): Promise<{ readonly configured: boolean }> }
  /** Wait out the settings watcher queue after a write, so the route is live when this resolves. */
  readonly settled?: () => Promise<void>
}

function valueAt(value: unknown, path: readonly string[]): unknown {
  let current = value
  for (const key of path) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

/** Nest a provider section at its settings path, e.g. `['providers','deepseek']` gives `{ providers: { deepseek: section } }`. */
function nestAt(path: readonly string[], section: Record<string, unknown>): Record<string, unknown> {
  let patch = section
  for (let index = path.length - 1; index >= 0; index--) patch = { [path[index]!]: patch }
  return patch
}

export function createRouteActivation(ports: RouteActivationPorts): RouteActivationPort {
  return {
    async ensureRouteActivated(providerId) {
      const entry = ports.llm.listConfigurableProviders().find(candidate => candidate.provider === providerId)
      if (entry === undefined) return
      const descriptor = ports.settings.describe({ redactSecrets: true }).find(candidate => candidate.ns === entry.settingsNs)
      // The resolved section, not `user`: a Blend app keeps its writes in its own settings layer, which `describe` reports as
      // `value` only (its `user` stays `{}`), so reading `user` took every route there for one without a profile.
      const profile = valueAt(descriptor?.value, entry.settingsPath)
      if (profile === undefined) {
        const name = ROUTE_NAMES[providerId]
        await ports.settings.update(entry.settingsNs, nestAt(entry.settingsPath, name === undefined ? {} : { displayName: name }), descriptor?.revision)
      } else {
        const ref = valueAt(profile, ['apiKeyEnv'])
        if (typeof ref !== 'string' || ref === '' || (await ports.credentials.describe(ref)).configured) return
        await ports.settings.mutate(entry.settingsNs, [{ op: 'unset', path: [...entry.settingsPath, 'apiKeyEnv'] }], descriptor?.revision)
      }
      await ports.settled?.()
    },
  }
}
