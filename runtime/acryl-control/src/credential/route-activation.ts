/**
 * `createRouteActivation`: make a provider usable right after a sign-in.
 *
 * A sign-in only ever writes a credential (the OAuth grant or the typed API key); it never touches `ctx.settings`.
 * `dsh-llm-pi-ai` registers a route as live only once its settings section names it (an empty profile, which means "use
 * the installed catalog's defaults", counts), so without this a successful sign-in leaves the provider credentialed but
 * absent from `ctx.llm`'s live directory and unusable. It writes only when the route has no settings profile yet, so it
 * never replaces one the user configured (custom base URL, model overrides), and never touches the display name.
 *
 * Framework-free like the rest of this folder: plain ports, no Cordis `Context`.
 */
import type { CredentialProjectionConfigurableProvider, CredentialProjectionSettingsPort } from './projection.ts'
import type { RouteActivationPort } from '../authorization/types.ts'

export interface RouteActivationSettingsPort extends CredentialProjectionSettingsPort {
  update(ns: string, patch: Record<string, unknown>, expectedRevision?: number): Promise<unknown>
}

export interface RouteActivationPorts {
  readonly settings: RouteActivationSettingsPort
  readonly llm: { listConfigurableProviders(): readonly CredentialProjectionConfigurableProvider[] }
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
      if (valueAt(descriptor?.user, entry.settingsPath) !== undefined) return
      await ports.settings.update(entry.settingsNs, nestAt(entry.settingsPath, {}), descriptor?.revision)
      await ports.settled?.()
    },
  }
}
