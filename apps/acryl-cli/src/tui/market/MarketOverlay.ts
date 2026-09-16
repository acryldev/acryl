/**
 * `/market` overlay: browse the real ACRYL Package Catalog and install a
 * plugin, in-process - no HTTP round trip to a Host route the way Web's own
 * browser-hosted Market client needs one (CLI and Loader tree share one
 * process). Reuses the exact same shared pieces Web and Desktop already
 * drive: `parseCatalogProviderPage` for schema validation, `desktopPnpm` for
 * the real `dsh plugin add -w` operation, and `livePluginActivation` for the
 * post-install hot-mount (spec 034 T006, completing the third surface).
 *
 * Deliberately v1-scoped like Web's own first cut: one hardcoded source (the
 * real `acryl.dev` catalog, matching what a Discover-tab default source
 * would show), no multi-source management, no search/filter. A real
 * `CatalogService`/`SourceStore`-backed version (matching Web/Desktop's own
 * richer Sources tab) is future work, not a blocker for "can a CLI user
 * install a real plugin from the store."
 * @module acryl-cli/tui/market/MarketOverlay
 */

import { randomUUID } from 'node:crypto'
import type { Component, TUI } from '@earendil-works/pi-tui'
import { Key, matchesKey } from '@earendil-works/pi-tui'
import type { Context } from '@deepseek-ai/cordis'
import { parseCatalogProviderPage, type CatalogProviderPage } from 'dsh-community-market'
import type {
  CliMarketPnpm,
  CliMarketProfile,
} from 'acryl-harness-runtime'
import { fg, theme } from '../theme.ts'

const bold = (s: string): string => `\x1b[1m${s}\x1b[0m`
const secondary = fg(theme.secondary)
const muted = fg(theme.muted)
const errorColor = fg(theme.error)
const success = fg(theme.success)

const CATALOG_URL = 'https://acryl.dev/v1/plugins'
const NPM_REGISTRY_ORIGIN = 'https://registry.npmjs.org'

/**
 * Resolve the real npm `dist-tags.latest` directly from the registry, rather
 * than trusting the catalog's own `latestVersion` field - acryl.dev's catalog
 * is a separately re-indexed snapshot of npm, not a live pass-through, and
 * can genuinely lag behind a real publish (reproduced directly: this session
 * published a fix, npm had it within seconds, the catalog still reported the
 * prior version minutes later). Falls back to the catalog's own version on
 * any failure (offline, registry hiccup, unexpected shape) - staleness is a
 * quieter failure mode than blocking every install because npm was briefly
 * unreachable.
 */
export async function resolveInstallVersion(packageName: string, catalogVersion: string): Promise<string> {
  try {
    const response = await fetch(`${NPM_REGISTRY_ORIGIN}/${encodeURIComponent(packageName)}`)
    if (!response.ok) return catalogVersion
    const manifest: unknown = await response.json()
    const distTags = manifest !== null && typeof manifest === 'object' && 'dist-tags' in manifest
      ? (manifest as { 'dist-tags'?: unknown })['dist-tags']
      : undefined
    const latest = distTags !== null && typeof distTags === 'object' && 'latest' in distTags
      ? (distTags as { latest?: unknown }).latest
      : undefined
    return typeof latest === 'string' && latest !== '' ? latest : catalogVersion
  } catch {
    return catalogVersion
  }
}

/**
 * Default the browse list to what's actually usable here: an item declaring
 * `compatibility.hosts` (populated from the package's own `acryl.surfaces`
 * field by acryl.dev's catalog build) must include `'tui'`, matching the
 * exact rule Web/Desktop's own Market tab already applies in
 * `dsh-community-market/src/client/MarketSettingsTab.tsx`'s
 * `matchesSurfaceFilter` - an item with no `compatibility` at all is
 * surface-agnostic (or simply never declared it), not "for no surface", so
 * it stays visible rather than being hidden by this default. Without this,
 * browsing here showed every package regardless of surface (Desktop-only
 * canvas plugins mixed in with CLI-only ones), with only a small trailing
 * label to tell them apart - reported directly as making it hard to find
 * "our cli plugins" among items that don't even run on this surface.
 */
function usableOnTui(item: CatalogProviderPage['items'][number]): boolean {
  const hosts = item.compatibility?.hosts
  return hosts === undefined || hosts.length === 0 || hosts.includes('tui')
}

/** The narrow slice of `livePluginActivation` this overlay actually calls. */
interface LivePluginActivation {
  activate(packageName: string): Promise<void>
}

type MarketState =
  | { readonly phase: 'loading' }
  | { readonly phase: 'error'; readonly message: string }
  | { readonly phase: 'browse'; readonly items: readonly CatalogProviderPage['items'][number][] }
  | { readonly phase: 'installing'; readonly item: CatalogProviderPage['items'][number] }
  | { readonly phase: 'done'; readonly item: CatalogProviderPage['items'][number]; readonly message: string }

export class MarketOverlay implements Component {
  private state: MarketState = { phase: 'loading' }
  private selected = 0
  // packageName -> real npm dist-tags.latest, filled in progressively after
  // the catalog itself loads (see resolveDisplayedVersions). The browse list
  // reads through this before falling back to the catalog's own possibly-
  // stale latestVersion, so what's shown always matches what install()
  // actually targets - a label that said one version while installing a
  // different one is its own confusion independent of which one is "right".
  private resolvedVersions = new Map<string, string>()

  constructor(
    private readonly tui: TUI,
    private readonly ctx: Context,
    private readonly close: () => void,
    private readonly onInstalled: () => void,
  ) {
    void this.load()
  }

  invalidate(): void {}

  private async load(): Promise<void> {
    try {
      const response = await fetch(CATALOG_URL)
      if (!response.ok) throw new Error(`catalog request failed: HTTP ${String(response.status)}`)
      const page = parseCatalogProviderPage(await response.json())
      const items = page.items.filter(usableOnTui)
      this.state = { phase: 'browse', items }
      void this.resolveDisplayedVersions(items)
    } catch (cause) {
      this.state = { phase: 'error', message: cause instanceof Error ? cause.message : String(cause) }
    }
    this.tui.requestRender()
  }

  /** Resolve every visible item's real npm version in the background so the list updates in place, without delaying the catalog's own initial render. */
  private async resolveDisplayedVersions(items: readonly CatalogProviderPage['items'][number][]): Promise<void> {
    await Promise.all(items.map(async item => {
      const packageName = item.package?.name ?? item.name
      if (item.latestVersion === undefined) return
      const resolved = await resolveInstallVersion(packageName, item.latestVersion)
      this.resolvedVersions.set(packageName, resolved)
      this.tui.requestRender()
    }))
  }

  private displayedVersion(item: CatalogProviderPage['items'][number]): string | undefined {
    const packageName = item.package?.name ?? item.name
    return this.resolvedVersions.get(packageName) ?? item.latestVersion
  }

  private async install(item: CatalogProviderPage['items'][number]): Promise<void> {
    const packageName = item.package?.name ?? item.name
    const catalogVersion = item.latestVersion
    if (catalogVersion === undefined) {
      this.state = { phase: 'error', message: `${packageName} has no installable version` }
      this.tui.requestRender()
      return
    }
    this.state = { phase: 'installing', item }
    this.tui.requestRender()
    try {
      const packageVersion = await resolveInstallVersion(packageName, catalogVersion)
      const pnpm = this.ctx.get('desktopPnpm') as CliMarketPnpm | undefined
      const profiles = this.ctx.get('desktopProfiles') as { current: CliMarketProfile } | undefined
      if (pnpm === undefined || profiles === undefined) {
        throw new Error('this profile has no install capability (desktopPnpm is unavailable)')
      }
      const handle = await pnpm.installPlugin({
        invokingDir: profiles.current.dir,
        recovery: { packageName, packageVersion, receiptId: `receipt:${randomUUID()}` },
      })
      const outcome = await handle.done
      if (outcome.exitCode !== 0) {
        throw new Error(`pnpm add exited with code ${String(outcome.exitCode)}`)
      }
      const live = this.ctx.get('livePluginActivation') as LivePluginActivation | undefined
      let message = `Installed ${packageName}@${packageVersion}. Restart to activate.`
      if (live !== undefined) {
        await live.activate(packageName)
        message = `Installed and activated ${packageName}@${packageVersion}.`
        this.onInstalled()
      }
      this.state = { phase: 'done', item, message }
    } catch (cause) {
      this.state = { phase: 'error', message: cause instanceof Error ? cause.message : String(cause) }
    }
    this.tui.requestRender()
  }

  render(_width: number): string[] {
    const header = bold(secondary('ACRYL Package Catalog'))
    switch (this.state.phase) {
      case 'loading':
        return [header, muted('Loading catalog...')]
      case 'error':
        return [header, errorColor(this.state.message), muted('esc close')]
      case 'installing':
        return [header, muted(`Installing ${this.state.item.displayName}...`)]
      case 'done':
        return [header, success(this.state.message), muted('esc close')]
      case 'browse': {
        const lines = [header, muted(`${String(this.state.items.length)} packages - enter installs, esc closes`)]
        this.state.items.forEach((item, index) => {
          const surfaces = item.compatibility?.hosts?.join('/') ?? ''
          const marker = index === this.selected ? success('> ') : '  '
          const label = `${item.displayName} ${muted(`(${this.displayedVersion(item) ?? '?'}${surfaces === '' ? '' : ` · ${surfaces}`})`)}`
          lines.push(`${marker}${label}`)
        })
        return lines
      }
    }
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || data === 'q') {
      this.close()
      return
    }
    if (this.state.phase !== 'browse') return
    const items = this.state.items
    if (matchesKey(data, Key.up)) {
      this.selected = Math.max(0, this.selected - 1)
      this.tui.requestRender()
      return
    }
    if (matchesKey(data, Key.down)) {
      this.selected = Math.min(items.length - 1, this.selected + 1)
      this.tui.requestRender()
      return
    }
    if (matchesKey(data, Key.enter)) {
      const item = items[this.selected]
      if (item !== undefined) void this.install(item)
    }
  }
}
