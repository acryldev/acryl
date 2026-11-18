// @vitest-environment jsdom
/** What counts as a secret: decided by what a field is (its type, its autocomplete, the shape of its value), and by the label only when the label says so in plain words. */

import { describe, expect, it } from 'vitest'
import { isSensitive, looksLikeSecret } from '../../src/page/driver/sensitivity.ts'

const field = (html: string): Element => {
  document.body.innerHTML = html
  return document.body.firstElementChild as Element
}

describe('a field is a secret by what it is', () => {
  it('reads the title of a card, a pin, a route: words that are only sometimes a secret are not enough', () => {
    for (const html of [
      '<input type="text" aria-label="Card title">',
      '<input type="text" name="newCard" placeholder="New card">',
      '<input type="text" id="card-title">',
      '<textarea aria-label="Card description"></textarea>',
      '<input type="text" aria-label="Drop a pin">',
      '<input type="text" aria-label="Routing key of the queue">',
      '<input type="text" name="title">',
    ])
      expect(isSensitive(field(html)), html).toBe(false)
  })

  it('refuses a password input, a credential or payment autocomplete, and a field marked by the page', () => {
    for (const html of [
      '<input type="password" aria-label="Anything">',
      '<input type="text" autocomplete="cc-number" aria-label="Number">',
      '<input type="text" autocomplete="cc-exp">',
      '<input type="text" autocomplete="one-time-code">',
      '<input type="text" autocomplete="current-password">',
      '<input type="text" autocomplete="section-pay billing cc-csc">',
      '<div data-acryl-sensitive><input type="text" aria-label="Inside"></div>',
    ])
      expect(isSensitive(field(html)) || document.querySelector('[data-acryl-sensitive] input') !== null && isSensitive(document.querySelector('input') as Element), html).toBe(true)
  })

  it('refuses a field that says in plain words what it holds', () => {
    for (const html of [
      '<input type="text" aria-label="Password">',
      '<input type="text" name="passphrase">',
      '<input type="text" placeholder="API key">',
      '<input type="text" id="private_key">',
      '<input type="text" aria-label="Access token">',
      '<input type="text" aria-label="Card number">',
      '<input type="text" name="credit-card-number">',
      '<input type="text" aria-label="CVV">',
      '<input type="text" aria-label="IBAN">',
      '<input type="text" aria-label="Social security number">',
      '<input type="text" aria-label="One-time code">',
      '<input type="text" aria-label="Account number">',
    ])
      expect(isSensitive(field(html)), html).toBe(true)
  })

  it('refuses a field whose value is a key or a token by its shape, and reads a hash, a sentence and a short value', () => {
    for (const value of [
      'sk-proj-abcdefghijklmnopqrstuvwx',
      'ghp_abcdefghijklmnopqrstuvwxyz0123456789',
      'xoxb-123456789012-abcdefghijkl',
      'AKIAIOSFODNN7EXAMPLE',
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
      'aB3dE5gH7jK9mN1pQ3sT5vW7yZ9bC1dF3gH',
    ]) {
      const input = field('<input type="text" aria-label="Title">') as HTMLInputElement
      input.value = value
      expect(isSensitive(input), value).toBe(true)
    }
    for (const value of ['', 'Buy oat milk', 'da39a3ee5e6b4b0d3255bfef95601890afd80709', 'https://example.com/a/very/long/path/that/is/not/a/secret', 'a sentence with several words in it that is long enough to count', '1234567890123456789012']) {
      const input = field('<input type="text" aria-label="Title">') as HTMLInputElement
      input.value = value
      expect(isSensitive(input), value).toBe(false)
    }
    expect(looksLikeSecret('sk-short')).toBe(false)
  })
})
