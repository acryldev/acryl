import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveInstallVersion } from '../../src/tui/market/MarketOverlay.js'

// Reported directly: acryl.dev's own catalog reported latestVersion 0.2.1 for
// a package minutes after this session published 0.3.0 to npm - the catalog
// is a separately re-indexed snapshot, not a live pass-through, and can
// genuinely lag a real publish. resolveInstallVersion exists specifically so
// the market installs npm's real dist-tags.latest, not whatever stale
// version the catalog happened to cache.
describe('resolveInstallVersion', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('prefers npm dist-tags.latest over a stale catalog version', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ 'dist-tags': { latest: '0.3.0' } }),
    })))
    await expect(resolveInstallVersion('acryl-dsh-editor-plugin-cli', '0.2.1')).resolves.toBe('0.3.0')
  })

  it('falls back to the catalog version when the registry request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
    await expect(resolveInstallVersion('acryl-dsh-editor-plugin-cli', '0.2.1')).resolves.toBe('0.2.1')
  })

  it('falls back to the catalog version when fetch throws (offline)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network unreachable') }))
    await expect(resolveInstallVersion('acryl-dsh-editor-plugin-cli', '0.2.1')).resolves.toBe('0.2.1')
  })

  it('falls back to the catalog version when the registry response has no dist-tags', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })))
    await expect(resolveInstallVersion('acryl-dsh-editor-plugin-cli', '0.2.1')).resolves.toBe('0.2.1')
  })

  it('falls back to the catalog version when dist-tags.latest is not a string', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ 'dist-tags': { latest: null } }),
    })))
    await expect(resolveInstallVersion('acryl-dsh-editor-plugin-cli', '0.2.1')).resolves.toBe('0.2.1')
  })
})
