import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { integrityOf, PluginStore, publishToNpm, type NpmPublishPort } from '../src/index.js'

const made: string[] = []
afterEach(() => { for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true }) })
function temp(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'plugin-hub-npm-test-')))
  made.push(dir)
  return dir
}

function plugin(manifest: Record<string, unknown>): string {
  const dir = join(temp(), 'p')
  mkdirSync(dir)
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ version: '1.0.0', type: 'module', main: './index.js', license: 'MIT', dsh: { bundle: { patch: './cordis.patch.yml' } }, ...manifest }, null, 2)}\n`)
  writeFileSync(join(dir, 'index.js'), "export const inject = ['tools']\nexport function apply() {}\n")
  writeFileSync(join(dir, 'cordis.patch.yml'), '- insert:\n    - id: p\n      name: p\n')
  return dir
}

interface Sent { readonly bytes: Buffer; readonly registry: string; readonly access: string }

/** A registry that keeps what was sent; `taken` lists name@version already on it. */
function fakeNpm(taken: readonly string[] = []): NpmPublishPort & { readonly sent: Sent[] } {
  const sent: Sent[] = []
  return {
    sent,
    hasVersion: (name, version) => taken.includes(`${name}@${version}`),
    publish(path, registry, access) { sent.push({ bytes: readFileSync(path), registry, access }) },
  }
}

describe('publishing to npm', () => {
  it('publishes the same deterministic tarball the store keeps, with the labels and contract, public with a license', async () => {
    const npm = fakeNpm()
    const store = new PluginStore(join(temp(), 'store'))
    const dir = plugin({ name: '@inboxxobni/tool.hello' })
    const result = await publishToNpm(dir, { visibility: 'public' }, { npm, store })
    expect(result).toMatchObject({ status: 'published', name: '@inboxxobni/tool.hello', version: '1.0.0', access: 'public', registry: 'https://registry.npmjs.org/' })
    if (result.status !== 'published') return
    expect(npm.sent).toHaveLength(1)
    expect(integrityOf(npm.sent[0]!.bytes)).toBe(result.integrity)
    expect(store.get('@inboxxobni/tool.hello', '1.0.0')?.integrity).toBe(result.integrity)
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    expect(manifest.keywords).toEqual(['acryl-package', 'cordis-plugin', 'dsh-plugin'])
    expect(manifest.acryl.requires).toEqual({ host: ['tools'] })
  })

  it('publishes a private scoped plugin with restricted access to the registry it is given', async () => {
    const npm = fakeNpm()
    const result = await publishToNpm(plugin({ name: '@o/private-ok' }), { registry: 'http://localhost:4873/' }, { npm, store: new PluginStore(join(temp(), 'store')) })
    expect(result).toMatchObject({ status: 'published', access: 'restricted', registry: 'http://localhost:4873/' })
    expect(npm.sent.map(entry => [entry.registry, entry.access])).toEqual([['http://localhost:4873/', 'restricted']])
  })

  it('refuses what npm would get wrong or the guards forbid, sending nothing', async () => {
    const npm = fakeNpm(['@o/taken@1.0.0'])
    const store = new PluginStore(join(temp(), 'store'))
    const publish = async (manifest: Record<string, unknown>, options = {}) => publishToNpm(plugin(manifest), options, { npm, store })
    expect(await publish({ name: 'unscoped-private' })).toMatchObject({ status: 'refused', reason: expect.stringMatching(/only a scoped package/u) })
    expect(await publish({ name: '@o/no-license', license: undefined }, { visibility: 'public' })).toMatchObject({ status: 'refused', reason: expect.stringMatching(/needs a "license"/u) })
    expect(await publish({ name: '@o/marked', private: true })).toMatchObject({ status: 'refused', reason: expect.stringMatching(/"private": true/u) })
    expect(await publish({ name: '@o/no-patch', dsh: undefined })).toMatchObject({ status: 'refused', reason: expect.stringMatching(/does not name its Loader patch, so no app can install it/u) })
    expect(await publish({ name: '@o/patch-left-out', files: ['index.js'] })).toMatchObject({ status: 'refused', reason: expect.stringMatching(/cordis\.patch\.yml is not among the files/u) })
    expect(await publish({ name: '@o/taken' })).toMatchObject({ status: 'refused', reason: expect.stringMatching(/already on .*published once/u) })
    const withSecret = plugin({ name: '@o/leaky' })
    writeFileSync(join(withSecret, 'config.js'), 'export const k = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789"\n')
    expect(await publishToNpm(withSecret, {}, { npm, store })).toMatchObject({ status: 'refused', secrets: [expect.objectContaining({ path: 'config.js' })] })
    expect(npm.sent).toEqual([])
  })

  it('refuses a version saved here with different files, so one name@version never means two tarballs', async () => {
    const npm = fakeNpm()
    const store = new PluginStore(join(temp(), 'store'))
    const dir = plugin({ name: '@o/changed' })
    store.put('@o/changed', '1.0.0', new Uint8Array([1, 2, 3]), { from: dir })
    expect(await publishToNpm(dir, {}, { npm, store })).toMatchObject({ status: 'refused', reason: expect.stringMatching(/already saved here with different files/u) })
    expect(npm.sent).toEqual([])
  })
})
