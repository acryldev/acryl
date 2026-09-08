import { describe, expect, it } from 'vitest'
import { formatStoredApiKeyHint } from '../../src/tui/login/LoginOverlay.js'

describe('formatStoredApiKeyHint', () => {
  it('shows a masked stored key above an empty replacement field', () => {
    expect(formatStoredApiKeyHint('csk-…y9wc')).toBe('Stored key: csk-…y9wc')
  })

  it('does not render a hint when no credential exists', () => {
    expect(formatStoredApiKeyHint(undefined)).toBeUndefined()
  })
})
