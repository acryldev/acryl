import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createPluginHub, packFolder, PluginStore, type InstallerPort, type ReleasePort } from '../src/index.js'

const made: string[] = []
afterEach(() => { for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true }) })
function temp(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'plugin-hub-update-')))
  made.push(dir)
  return dir
}

function release(version: string): Buffer {
  const dir = join(temp(), 'p')
  mkdirSync(dir)
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: 'acryl-quick-notes', version, acryl: { requires: { host: ['connection'] } } })}\n`)
  writeFileSync(join(dir, 'index.js'), `export const version = '${version}'\n`)
  return packFolder(dir).tarball
}

/** A GitHub repository whose latest release can move, and a profile that remembers what was installed. */
function world() {
  const tags: Record<string, Buffer> = { 'v0.2.1': release('0.2.1') }
  let latest = 'v0.2.1'
  const releases: ReleasePort = {
    release: async (_o, _r, tag) => {
      const chosen = tag ?? latest
      return tags[chosen] === undefined ? undefined : { tag: chosen, assets: [{ name: `${chosen}.tgz`, url: chosen }] }
    },
    download: async url => tags[url]!,
  }
  const installed = new Map<string, string>()
  const installer: InstallerPort = {
    installBundle: async path => {
      installed.set('acryl-quick-notes', /([\d.]+)\.tgz$/u.exec(path)![1]!)
      return { application: 'applied' }
    },
    listBundles: async () => [...installed].map(([name, version]) => ({ name, version, enabled: true, installed: true, removable: true })),
  }
  const hub = createPluginHub({ store: new PluginStore(join(temp(), 'store')), releases, has: () => true, installer: () => installer })
  return { hub, installed, publish: (version: string) => { tags[`v${version}`] = release(version); latest = `v${version}` } }
}

describe('update', () => {
  it('installs the newest release from where the plugin was pulled, says up to date after, and can go back to the old version', async () => {
    const { hub, installed, publish } = world()
    expect((await hub.pull('github:inboxxobni/acryl-quick-notes@0.2.1')).status).toBe('installed')
    expect(await hub.update('acryl-quick-notes')).toMatchObject({ status: 'up-to-date', version: '0.2.1', source: 'github:inboxxobni/acryl-quick-notes' })
    publish('0.3.0')
    expect(await hub.update('acryl-quick-notes')).toMatchObject({ status: 'updated', from: '0.2.1', to: '0.3.0' })
    expect(installed.get('acryl-quick-notes')).toBe('0.3.0')
    expect(await hub.update('acryl-quick-notes')).toMatchObject({ status: 'up-to-date', version: '0.3.0' })
    // Rollback is a pull of the older version from the store: offline, the same bytes as before.
    expect((await hub.pull('store:acryl-quick-notes@0.2.1')).status).toBe('installed')
    expect(installed.get('acryl-quick-notes')).toBe('0.2.1')
    expect(hub.saved().map(entry => entry.version)).toEqual(['0.3.0', '0.2.1'])
  })

  it('refuses to guess for a plugin it did not pull, or one pulled from a file', async () => {
    const { hub } = world()
    expect(await hub.update('never-pulled')).toMatchObject({ status: 'not-updatable', reason: expect.stringMatching(/was not pulled through the plugin hub/u) })
    const file = join(temp(), 'q.tgz')
    writeFileSync(file, release('1.0.0'))
    await hub.pull(file)
    expect(await hub.update('acryl-quick-notes')).toMatchObject({ status: 'not-updatable', reason: expect.stringMatching(/has no newer releases/u) })
  })
})

describe('releases from the first port that sees the repository', () => {
  it('falls back to the second port for a repository the first cannot see, and downloads through the port that answered', async () => {
    const { firstReleasePort } = await import('../src/index.js')
    const calls: string[] = []
    const anonymous: ReleasePort = { release: async () => { calls.push('https'); return undefined }, download: async () => { throw new Error('not this port') } }
    const signedIn: ReleasePort = { release: async () => { calls.push('gh'); return { tag: 'v1.0.0', assets: [{ name: 'p.tgz', url: 'api://asset/1' }] } }, download: async url => { calls.push(`gh download ${url}`); return new Uint8Array([1]) } }
    const port = firstReleasePort(anonymous, signedIn)
    expect((await port.release('o', 'private-repo'))?.tag).toBe('v1.0.0')
    expect(await port.download('api://asset/1')).toEqual(new Uint8Array([1]))
    expect(calls).toEqual(['https', 'gh', 'gh download api://asset/1'])
    const nowhere = firstReleasePort(anonymous, { ...anonymous })
    expect(await nowhere.release('o', 'missing')).toBeUndefined()
  })
})
