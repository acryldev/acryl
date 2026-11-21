/**
 * A failed chat turn in words a person can act on. The harness records a provider's refusal as the provider sent it, for
 * example `400 {"type":"error","error":{"type":"invalid_request_error","message":"Third-party apps now draw from your
 * extra usage, ..."},"request_id":"req_..."}`, and the chat used to print that text whole. This reads the provider's own
 * sentence out of the JSON body, names the provider when the body says who it is, adds a hint for refusals whose fix is
 * known, and keeps the raw text for a Details toggle.
 */

import type { SignInLocaleKey } from './locales.ts'

export interface TurnFailure {
  /** The row's title: the turn failed, or (signed out of DeepSeek) it was stopped. */
  readonly title: 'turnFailed' | 'turnStopped'
  /** What went wrong: the provider's sentence, a dictionary line for a known harness code, or the message as recorded. */
  readonly text: { readonly key: SignInLocaleKey } | { readonly said: string }
  /** What to do about it, for a refusal whose fix is known. */
  readonly hint?: SignInLocaleKey
  /** The failure as recorded, when `text` is not that already. */
  readonly raw?: string
}

/** Harness failure codes whose meaning the chat says in its own words (the same set DeepSeek's chat translates). */
const CODE_TEXT: Readonly<Record<string, SignInLocaleKey>> = {
  ACCOUNT_SIGNED_OUT: 'failureAccountSignedOut',
  ACCOUNT_SIGN_IN_REQUIRED: 'failureAccountSignInRequired',
  QUOTA: 'failureQuota',
  ACCOUNT_QUOTA: 'failureQuota',
  AUTH: 'failureAuth',
}

/** Provider refusals with a known way out, matched on the provider's own sentence. */
const KNOWN: readonly { readonly match: RegExp, readonly hint: SignInLocaleKey }[] = [
  // Anthropic, since 2026: a Claude subscription signed in from a third-party app is billed to "extra usage" only.
  { match: /third-party apps now draw from your extra usage/iu, hint: 'hintClaudeExtraUsage' },
]

const record = (value: unknown): Record<string, unknown> | undefined => typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined

/** The provider's sentence and, when the body says so, the provider's name, from the JSON body inside a recorded failure. */
function providerSays(message: string): { readonly said: string, readonly provider?: string } | undefined {
  const start = message.indexOf('{')
  if (start === -1) return undefined
  let body: Record<string, unknown> | undefined
  try {
    body = record(JSON.parse(message.slice(start)))
  } catch {
    return undefined
  }
  const nested = record(body?.error)
  const said = [nested?.message, body?.error_description, body?.message, body?.error].find(value => typeof value === 'string' && value.trim() !== '')
  if (typeof said !== 'string') return undefined
  // Anthropic's envelope: `{"type":"error","error":{"type":...,"message":...},"request_id":...}`.
  const anthropic = body?.type === 'error' && typeof nested?.type === 'string'
  return { said: said.trim(), ...anthropic ? { provider: 'Claude' } : {} }
}

export function describeTurnFailure(message: string, code: string | undefined): TurnFailure {
  const title = code === 'ACCOUNT_SIGNED_OUT' ? 'turnStopped' : 'turnFailed'
  const provider = providerSays(message)
  if (provider !== undefined) {
    const hint = KNOWN.find(known => known.match.test(provider.said))?.hint
    return { title, text: { said: provider.provider === undefined ? provider.said : `${provider.provider}: ${provider.said}` }, ...hint === undefined ? {} : { hint }, raw: message }
  }
  const key = code === undefined ? undefined : CODE_TEXT[code]
  return key === undefined ? { title, text: { said: message } } : { title, text: { key }, raw: message }
}

/** One run of a sentence: plain text, or a web address to open. */
export type TextPart = { readonly text: string } | { readonly text: string, readonly href: string }

/** Web addresses in a sentence: `https://...`, or a bare `claude.ai/settings/usage`, without a sentence's closing punctuation. */
const ADDRESS = /\bhttps?:\/\/[^\s"'<>]+|\b(?:[a-z0-9-]+\.)+(?:ai|com|dev|io|net|org)\/[^\s"'<>]*/giu

export function linkParts(sentence: string): readonly TextPart[] {
  const parts: TextPart[] = []
  let at = 0
  for (const match of sentence.matchAll(ADDRESS)) {
    const text = match[0].replace(/[.,;:!?)]+$/u, '')
    if (match.index > at) parts.push({ text: sentence.slice(at, match.index) })
    parts.push({ text, href: /^https?:\/\//iu.test(text) ? text : `https://${text}` })
    at = match.index + text.length
  }
  if (at < sentence.length) parts.push({ text: sentence.slice(at) })
  return parts
}
