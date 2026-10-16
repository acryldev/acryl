/**
 * DSH's plugin manager with ACRYL's pull in front of it (spec 044, `specs/044-extension-persistence-and-registries/lifecycle.md`, D7 option B).
 *
 * DSH's Plugins page calls `pluginManager.inspect(spec)` and `.installBundle(spec)` with whatever the person typed, and pnpm would clone a git
 * address and install whatever its branch holds. Inside ACRYL a git address instead means that repository's latest release: it is fetched into
 * the plugin store, its sha512 kept and the services it needs checked, and DSH's own installer then installs that tarball. A repository with no
 * release, a branch or commit, or a git host other than GitHub is refused on the page with the reason. Names, folders and tarballs go to DSH's
 * manager unchanged, so everything else (compatibility checks, script approval, live reload, listing, enabling) stays DSH's.
 *
 * Enabling and disabling have one store (spec 001 T089): a row ACRYL's plugin lifecycle admits is listed to DSH's page as one it can switch,
 * and the page's switch goes through that lifecycle (applied live, kept in ACRYL's override file), never into the profile's patch file, where
 * a second, contradicting disable used to be written. Rows ACRYL does not admit (DSH's own) stay DSH's, written as DSH writes them.
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

/** The row ACRYL's lifecycle admits to user control for this Loader entry, or undefined (no lifecycle here, or DSH's own row). */
function admitted(ctx, entryId) {
  const lifecycle = ctx.get('acrPluginLifecycle')
  const entry = lifecycle?.snapshot().entries.find(candidate => candidate.entryId === entryId)
  return entry?.mutable === true ? lifecycle : undefined
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

  async listPlugins() {
    const rows = await super.listPlugins()
    const lifecycle = this.ctx.get('acrPluginLifecycle')
    if (lifecycle === undefined) return rows
    const mutable = new Set(lifecycle.snapshot().entries.filter(entry => entry.mutable).map(entry => entry.entryId))
    return rows.map(row => {
      if (!mutable.has(row.entryId) || row.readOnlyReason === 'management-required') return row
      const { readOnlyReason: _unaddressable, ...rest } = row
      return { ...rest, patchId: row.patchId ?? row.entryId.replace(/^include:/u, '') }
    })
  }

  async setPluginEnabled(id, enabled) {
    const lifecycle = admitted(this.ctx, id)
    if (lifecycle === undefined) return super.setPluginEnabled(id, enabled)
    const result = { stage: 'enable', target: id, enabled, changed: false, application: 'applied' }
    try {
      await lifecycle.setEnabled(id, enabled)
      result.changed = true
    } catch (error) {
      // Already in the asked state is not a failure: the page shows the row as it is.
      if (error?.code !== 'already-enabled' && error?.code !== 'already-disabled') {
        result.application = 'failed'
        result.error = { code: 'operation-error', diagnostic: error instanceof Error ? error.message : String(error) }
      }
    }
    this.ctx.emit('plugin-manager/changed', { reason: 'plugin' })
    return result
  }
}
