import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openKv } from '../src/open.ts'

const dirs: string[] = []
afterEach(async () => {
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})
async function folder(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'acryl-kv-json-open-'))
  dirs.push(dir)
  return dir
}

describe('openKv', () => {
  it('creates the file and its folders on the first write, with the keys in code point order', async () => {
    const dir = await folder()
    const file = join(dir, 'nested', 'deeper', 'kv.json')
    const { kv, close } = await openKv({ path: file })
    expect(existsSync(file)).toBe(false)
    await kv.set('b', 2)
    await kv.set('a', { x: [1] })
    await close()
    expect(readFileSync(file, 'utf8')).toBe('{"version":1,"entries":{"a":{"x":[1]},"b":2}}\n')
    expect(readdirSync(join(dir, 'nested', 'deeper'))).toEqual(['kv.json'])
  })

  it('refuses a file that does not parse, or is not a kv file, and does not change it', async () => {
    const dir = await folder()
    const file = join(dir, 'kv.json')
    for (const content of ['{"version":1,"entries":{"a":', '', '[]', '{"version":2,"entries":{}}', '{"version":1}', '{"version":1,"entries":[]}']) {
      writeFileSync(file, content)
      await expect(openKv({ path: file }), JSON.stringify(content)).rejects.toThrow(/not a readable kv file.*not changed/u)
      expect(readFileSync(file, 'utf8')).toBe(content)
    }
  })

  it('removes the temporary files a crash left, and only those', async () => {
    const dir = await folder()
    const file = join(dir, 'kv.json')
    writeFileSync(join(dir, 'kv.json.4242.7.tmp'), 'half a wri')
    writeFileSync(join(dir, 'other.json.1.1.tmp'), 'not ours')
    writeFileSync(join(dir, 'kv.json.keep'), 'not a temp file')
    const { close } = await openKv({ path: file })
    await close()
    expect(readdirSync(dir).sort()).toEqual(['kv.json.keep', 'other.json.1.1.tmp'])
  })

  it('leaves no temporary file behind after many writes, and the file holds the last state', async () => {
    const dir = await folder()
    const file = join(dir, 'kv.json')
    const { kv, close } = await openKv({ path: file })
    await Promise.all(Array.from({ length: 30 }, (_, index) => kv.set(`k${index}`, index)))
    await close()
    expect(readdirSync(dir)).toEqual(['kv.json'])
    expect(Object.keys(JSON.parse(readFileSync(file, 'utf8')).entries)).toHaveLength(30)
  })

  it('does not change what a reader sees when a write fails, and keeps working', async () => {
    const dir = await folder()
    const file = join(dir, 'kv.json')
    const { kv, close } = await openKv({ path: file })
    await kv.set('k', 'before')
    // The folder is replaced by a file, so the next temporary file cannot be created.
    await rm(dir, { recursive: true, force: true })
    writeFileSync(dir, 'in the way')
    await expect(kv.set('k', 'after')).rejects.toThrow()
    expect(await kv.get('k')).toBe('before')
    await rm(dir, { force: true })
    await mkdir(dir, { recursive: true })
    await kv.set('k', 'recovered')
    expect(await kv.get('k')).toBe('recovered')
    await close()
  })

  it('serializes writes in call order', async () => {
    const dir = await folder()
    const { kv, close } = await openKv({ path: join(dir, 'kv.json') })
    await Promise.all(Array.from({ length: 25 }, (_, index) => kv.set('k', index)))
    expect(await kv.get('k')).toBe(24)
    await close()
  })
})
