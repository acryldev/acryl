import { describe, expect, it } from 'vitest'
import { deriveApiKeyRef, maskKeyPreview } from '../../src/tui/modelProfile/types.js'

describe('maskKeyPreview', () => {
  it('shows first/last 4 characters of a long key, masking the middle', () => {
    expect(maskKeyPreview('sk-proj-abcdefghijklmnopqrstuvwxyz9sZ4')).toBe('sk-p…9sZ4')
  })

  it('never reveals more than the first/last 4 characters regardless of length', () => {
    const key = 'a'.repeat(200) + 'END'
    const preview = maskKeyPreview(key)
    expect(preview).toBe('aaaa…aEND')
    expect(preview.length).toBeLessThan(key.length)
  })

  it('masks all but the first and last character for a short key (<=10 chars)', () => {
    expect(maskKeyPreview('abcdefgh')).toBe('a******h')
  })

  it('masks a 2-character key fully', () => {
    expect(maskKeyPreview('ab')).toBe('**')
  })

  it('masks a 1-character key fully', () => {
    expect(maskKeyPreview('a')).toBe('*')
  })

  it('returns an empty string for an empty key', () => {
    expect(maskKeyPreview('')).toBe('')
  })

  it('never includes the exact full key value for any non-trivial input', () => {
    const key = 'sk-live-51H8xyz9SecretValueThatMustNeverAppearVerbatim'
    expect(maskKeyPreview(key)).not.toContain(key)
  })
})

describe('deriveApiKeyRef', () => {
  it('uppercases and suffixes a simple route name', () => {
    expect(deriveApiKeyRef('mistral')).toBe('MISTRAL_API_KEY')
  })

  it('replaces non-alphanumeric characters with underscores', () => {
    expect(deriveApiKeyRef('my-proxy.v2')).toBe('MY_PROXY_V2_API_KEY')
  })

  it('prefixes a route that starts with a digit so the ref stays a valid identifier', () => {
    expect(deriveApiKeyRef('123fast')).toBe('P_123FAST_API_KEY')
  })
})
