/**
 * DSH's plugin manager with ACRYL's pull in front of it (spec 044, `specs/044-extension-persistence-and-registries/lifecycle.md`, D7 option B).
 *
 * DSH's Plugins page calls `pluginManager.inspect(spec)` and `.installBundle(spec)` with whatever the person typed, and pnpm would clone a git
 * address and install whatever its branch holds. Inside ACRYL a git address instead means that repository's latest release: it is fetched into
 * the plugin store, its sha512 kept and the services it needs checked, and DSH's own installer then installs that tarball. A repository with no
 * release, a branch or commit, or a git host other than GitHub is refused on the page with the reason. Names, folders and tarballs go to DSH's
 * manager unchanged, so everything else (compatibility checks, script approval, live reload, listing, enabling) stays DSH's.
 *
 * The profile swaps DSH's `plugin-manager` row for this one rather than adding a second provider (Cordis refuses two). The class extends
 * DSH's: its `@Remote` markers are written onto the prototype of the instance being constructed, so the page reaches these overrides.
 */
import { PluginManager } from '@deepseek-ai/dsh-plugin-manager'
import { createPluginHub, firstReleasePort, githubReleasesOverHttps, githubReleasesViaGh, PluginStore, storeRootOf } from '@webboxes/plugin-hub'
import { releaseSpec } from './release-spec.js'

/**
 * The hub a manager pulls through: the app instance's store, GitHub releases, and the contract checked against this app. A module function, not a
 * `#private` method: Cordis calls a service through a proxy, and a private member is not reachable through it ("Receiver must be an instance").
 */
function hubOf(ctx) {
  return createPluginHub({
    store: new PluginStore(storeRootOf(ctx.appInstance.home)),
    releases: firstReleasePort(githubReleasesOverHttps(), githubReleasesViaGh()),
    has: service => ctx.get(service) !== undefined,
    installer: () => undefined,
  })
}

export default class AcrylPluginManager extends PluginManager {
  static inject = [...PluginManager.inject, 'appInstance']

  async inspect(spec, options, signal) {
    const resolved = await releaseSpec(spec, hubOf(this.ctx))
    // `unknown` is the problem DSH's page shows with its reason ("The plugin could not be looked up: <reason>"); the others show a fixed text.
    if (resolved.refused !== undefined) return { status: 'refused', problem: 'unknown', reason: resolved.refused }
    const inspection = await super.inspect(resolved.spec, options, signal)
    if (resolved.pulled === undefined || inspection.status !== 'accepted') return inspection
    return { ...inspection, name: resolved.pulled.name, version: resolved.pulled.version }
  }

  async installBundle(spec, options) {
    const resolved = await releaseSpec(spec, hubOf(this.ctx))
    if (resolved.refused !== undefined) {
      return { changed: false, application: 'failed', stage: 'install', target: String(spec), error: { code: 'invalid-spec', diagnostic: resolved.refused } }
    }
    return super.installBundle(resolved.spec, options)
  }
}
