import { createHash } from 'node:crypto'
import { md5, sha1, sha256 } from './crypto.ts'

describe('crypto', () => {
  it('sha256', async () => {
    expect(await sha256('acryl')).toBe(
      '1722bce316636434b7346179cda6e5918d1265e875548d8393d897d0e8056490'
    )
    expect(await sha256('炎')).toBe(
      '1fddc5a562ee1fbeb4fc6def7d4be4911fcdae4273b02ae3a507b170ba0ea169'
    )
    expect(await sha256('abcdedf')).not.toBe('abcdef')
  })

  it('sha1', async () => {
    expect(await sha1('acryl')).toBe('a0d04d622e8eee4b96ec3e768158f79849e4feaa')
    expect(await sha1('炎')).toBe('d56e09ae2421b2b8a0b5ee5fdceaed663c8c9472')
    expect(await sha1('abcdedf')).not.toBe('abcdef')
  })

  // MD5 is not part of the WebCrypto standard.
  // Node.js' Web Crypto API does not support it (But Cloudflare Workers supports it).
  // We should skip this test in a Node.js environment.
  it.skip('md5', async () => {
    expect(await md5('acryl')).toBe('6d6de29f8c2b6b8741b0d549b556de5c')
    expect(await md5('炎')).toBe('f620d89a5a782c22b4420acb39121be3')
    expect(await md5('abcdedf')).not.toBe('abcdef')
  })

  it('Should not be the same values - compare difference objects', async () => {
    expect(await sha256({ foo: 'bar' })).not.toEqual(
      await sha256({
        bar: 'foo',
      })
    )
  })

  it('Should create hash for Buffer', async () => {
    const hash = createHash('sha256').update(new Uint8Array(1)).digest('hex')
    expect(await sha256(new Uint8Array(1))).toBe(hash)
    expect(await sha256(new Uint8Array(1))).not.toEqual(await sha256(new Uint8Array(2)))
  })
})
