import { describe, expect, it } from 'vitest'
import { missingCredentialAdvice } from '../src/credential/missing-credential.ts'

describe('missingCredentialAdvice', () => {
  it('offers both ways out for a provider with an account sign-in', () => {
    expect(missingCredentialAdvice({ provider: 'anthropic', name: 'Anthropic', accountSignIn: true }))
      .toBe('Anthropic has no API key on this computer. Add an API key in Settings > Models, or sign in with Claude under Settings > Models > Sign in with an account.')
  })

  it('offers the API key alone for a provider without one', () => {
    expect(missingCredentialAdvice({ provider: 'mistral', name: 'mistral', accountSignIn: false }))
      .toBe('mistral has no API key on this computer. Add one in Settings > Models.')
  })

  it('names a route the picker no longer lists by what people call it', () => {
    expect(missingCredentialAdvice({ provider: 'anthropic', name: undefined, accountSignIn: true })).toMatch(/^Claude has no API key/u)
  })
})
