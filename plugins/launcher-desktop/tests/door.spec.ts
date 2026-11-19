/** The door client: it reaches only the running app named by `<app>/.acryl/door.json`, on loopback, and says "not running" for anything else. */
import { describe, expect, it } from 'vitest'
import { DoorUnavailable, fileDoor } from '../src/door.ts'

const file = (url: string, secret = 's3cret') => () => JSON.stringify({ version: 1, url, secret, pid: 1 })
const answering = (answer: unknown, seen: Array<{ url: string, init: { method?: string, headers?: Record<string, string>, body?: string } | undefined }> = []) =>
  async (url: string, init?: { method?: string, headers?: Record<string, string>, body?: string }) => { seen.push({ url, init }); return { json: async () => answer } }

describe('fileDoor', () => {
  it('calls a verb on the app named by door.json, with its secret, and returns the answer', async () => {
    const seen: Array<{ url: string, init: { method?: string, headers?: Record<string, string>, body?: string } | undefined }> = []
    const door = fileDoor(answering({ ok: true, value: [1] }, seen), file('http://127.0.0.1:3539/'))
    expect(await door.call('/apps/shop', 'plugin-list', {})).toEqual({ ok: true, value: [1] })
    expect(seen[0]?.url).toBe('http://127.0.0.1:3539/api/acryl-door/call')
    expect(seen[0]?.init?.headers?.authorization).toBe('Bearer s3cret')
    expect(JSON.parse(seen[0]?.init?.body ?? '')).toEqual({ verb: 'plugin-list', args: {} })
    await door.confirmPublish('/apps/shop', { name: 'x' })
    expect(seen[1]?.url).toBe('http://127.0.0.1:3539/api/acryl-door/publish-confirmed')
  })

  it('says the app is not running when door.json is missing, unreadable, not loopback, or nothing answers', async () => {
    const nothing = async () => { throw new TypeError('fetch failed') }
    const missing = fileDoor(answering({}), () => { throw new Error('ENOENT') })
    await expect(missing.call('/a', 'plugin-list', {})).rejects.toBeInstanceOf(DoorUnavailable)
    await expect(fileDoor(answering({}), () => 'not json').call('/a', 'plugin-list', {})).rejects.toThrow('not running')
    await expect(fileDoor(answering({}), file('http://example.com:80/')).call('/a', 'plugin-list', {})).rejects.toThrow('not running')
    await expect(fileDoor(answering({}), file('https://127.0.0.1:1/')).call('/a', 'plugin-list', {})).rejects.toThrow('not running')
    await expect(fileDoor(nothing, file('http://127.0.0.1:3539/')).call('/a', 'plugin-list', {})).rejects.toThrow('not running')
  })
})
