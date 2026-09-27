import { describe, expect, it } from 'vitest'
import { manifestDigest } from '../../src/index.js'

describe('manifestDigest', () => {
  it('is the lowercase hex SHA-256 of the exact manifest bytes', () => {
    expect(manifestDigest('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(manifestDigest('a\n')).not.toBe(manifestDigest('a'))
  })
})
