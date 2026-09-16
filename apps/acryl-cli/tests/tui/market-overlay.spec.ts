import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MarketOverlay, resolveInstallVersion } from '../../src/tui/market/MarketOverlay.js'

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

// Reported directly: a real install failure surfaced only "pnpm add exited
// with code 1" - no way to tell a pnpm-store mismatch from a 404 from a
// network failure without reproducing the underlying `dsh plugin add`
// command by hand. The real reason was always on the child process's own
// stderr; it just wasn't being read.
describe('MarketOverlay install failure reporting', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('includes the pnpm child process stderr in the error message', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('acryl.dev')) {
        return {
          ok: true,
          json: async () => ({
            schemaVersion: '1.0.0',
            generatedAt: '2026-08-17T08:00:00Z',
            revision: '2026-08-17T08:00:00Z',
            items: [{
              id: 'some-plugin',
              name: 'some-plugin',
              displayName: 'Some Plugin',
              summary: 'A plugin',
              latestVersion: '1.0.0',
              package: { registry: 'npm', name: 'some-plugin' },
            }],
            page: { total: 1 },
          }),
        }
      }
      return { ok: true, json: async () => ({ 'dist-tags': { latest: '1.0.0' } }) }
    }))

    const stderr = new PassThrough()
    const fakePnpm = {
      installPlugin: vi.fn(async () => {
        const done = new Promise(resolve => {
          setTimeout(() => {
            stderr.write('ERR_PNPM_UNEXPECTED_STORE Unexpected store location')
            stderr.end()
            resolve({ exitCode: 1, signal: null })
          }, 5)
        })
        return {
          stdout: new PassThrough(),
          stderr,
          done,
          cancel: () => {},
        }
      }),
    }
    const fakeCtx = {
      get: (key: string) => {
        if (key === 'desktopPnpm') return fakePnpm
        if (key === 'desktopProfiles') return { current: { name: 'acryl', dir: '/tmp' } }
        return undefined
      },
    }
    const fakeTui = { requestRender: () => {}, terminal: { rows: 24, cols: 80 } }
    const overlay = new MarketOverlay(fakeTui as never, fakeCtx as never, () => {}, () => {})

    await new Promise(resolve => setTimeout(resolve, 20)) // let load() resolve
    overlay.handleInput('\r') // enter installs the only (selected) item
    await new Promise(resolve => setTimeout(resolve, 20)) // let install() resolve

    const rendered = overlay.render(80).join('\n')
    expect(rendered).toContain('pnpm add exited with code 1')
    expect(rendered).toContain('ERR_PNPM_UNEXPECTED_STORE')
  })
})
