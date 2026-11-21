// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply } from '../../src/client/index.ts'
import { en } from '../../src/client/locales.ts'
import { describeTurnFailure, linkParts } from '../../src/client/turn-failure.ts'
import { TurnFailureView } from '../../src/client/TurnFailureView.tsx'

afterEach(cleanup)

// What the chat showed a person whose Claude plan does not cover third-party apps (request id shortened).
const EXTRA_USAGE = '400 {"type":"error","error":{"type":"invalid_request_error","message":"Third-party apps now draw from your extra usage, not your plan limits. Add more at claude.ai/settings/usage and keep going."},"request_id":"req_011C"}'

const t = (key: keyof typeof en): string => en[key]

function show(message: string, code?: string) {
  const openExternal = vi.fn()
  const props = { node: { data: { message, ...code === undefined ? {} : { code } } }, openExternal, t }
  render(<TurnFailureView {...(props as unknown as Parameters<typeof TurnFailureView>[0])} />)
  return { openExternal }
}

describe('describeTurnFailure', () => {
  it('reads the provider\'s sentence out of Anthropic\'s JSON body, names Claude and knows the fix', () => {
    expect(describeTurnFailure(EXTRA_USAGE, 'INVALID_REQUEST')).toEqual({
      title: 'turnFailed',
      text: { said: 'Claude: Third-party apps now draw from your extra usage, not your plan limits. Add more at claude.ai/settings/usage and keep going.' },
      hint: 'hintClaudeExtraUsage',
      raw: EXTRA_USAGE,
    })
  })

  it('reads another provider\'s body without naming it', () => {
    expect(describeTurnFailure('429 {"error":{"message":"Rate limit reached for gpt-5.5","type":"requests"}}', 'RATE_LIMIT').text).toEqual({ said: 'Rate limit reached for gpt-5.5' })
  })

  it('prefers the provider\'s sentence to the generic line for its code', () => {
    expect(describeTurnFailure('401 {"type":"error","error":{"type":"authentication_error","message":"OAuth token has expired."}}', 'AUTH').text).toEqual({ said: 'Claude: OAuth token has expired.' })
  })

  it('says a known harness code in its own words, and a plain message as it is', () => {
    expect(describeTurnFailure('Stopped because you signed out of DeepSeek.', 'ACCOUNT_SIGNED_OUT')).toEqual({ title: 'turnStopped', text: { key: 'failureAccountSignedOut' }, raw: 'Stopped because you signed out of DeepSeek.' })
    expect(describeTurnFailure('socket hang up', 'NETWORK')).toEqual({ title: 'turnFailed', text: { said: 'socket hang up' } })
    expect(describeTurnFailure('Bad answer: {not json', undefined)).toEqual({ title: 'turnFailed', text: { said: 'Bad answer: {not json' } })
  })
})

describe('linkParts', () => {
  it('makes bare and full web addresses links, leaving the sentence\'s punctuation out', () => {
    expect(linkParts('Add more at claude.ai/settings/usage. Or see https://docs.example.com/x, then retry.')).toEqual([
      { text: 'Add more at ' },
      { text: 'claude.ai/settings/usage', href: 'https://claude.ai/settings/usage' },
      { text: '. Or see ' },
      { text: 'https://docs.example.com/x', href: 'https://docs.example.com/x' },
      { text: ', then retry.' },
    ])
  })
})

describe('TurnFailureView', () => {
  it('shows the Claude extra-usage refusal in plain words, with the fix, a link that opens outside, and the raw text behind Details', () => {
    const { openExternal } = show(EXTRA_USAGE, 'INVALID_REQUEST')
    expect(screen.getByText('This turn failed')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('Claude: Third-party apps now draw from your extra usage, not your plan limits.')
    expect(screen.getByRole('status').textContent).toContain('Your Claude plan does not cover apps like ACRYL. Turn on extra usage at claude.ai/settings/usage, or choose another model.')
    const links = screen.getAllByRole('link', { name: 'claude.ai/settings/usage' })
    expect(links).toHaveLength(2)
    expect(links[0]?.getAttribute('href')).toBe('https://claude.ai/settings/usage')
    fireEvent.click(links[0]!)
    expect(openExternal).toHaveBeenCalledWith('https://claude.ai/settings/usage')
    const details = screen.getByText('Details').closest('details')!
    expect(details.open).toBe(false)
    expect(details.textContent).toContain('"request_id":"req_011C"')
    expect(screen.getByText('INVALID_REQUEST')).toBeTruthy()
  })

  it('shows a plain failure with no Details to open', () => {
    show('socket hang up')
    expect(screen.getByRole('status').textContent).toBe('This turn failedsocket hang up')
    expect(screen.queryByText('Details')).toBeNull()
  })
})

describe('the failed-turn row replacement', () => {
  it('shadows DeepSeek\'s turn-error row whichever plugin registers first', () => {
    const upstream = { name: 'conversation.chat.node', key: 'turn-error' } as never
    const Upstream = (() => null) as never
    for (const upstreamFirst of [true, false]) {
      const core = new SlotCore()
      core.register({
        name: 'root',
        children: {
          'settings.models.footer': { kind: 'list', scope: 'root' },
          'settings.models.sign-in': { kind: 'single', scope: 'root' },
          'settings.onboarding': { kind: 'list', scope: 'root' },
          'conversation.chat.node': { kind: 'keyed', scope: 'session' },
        },
      } as never, (() => null) as never)
      const ctx = {
        slots: { inject: (_name: string, register: () => unknown) => { register() }, register: (options: never, component: never) => core.register(options, component) },
        locale: { register: () => () => {} },
        effect: (run: () => unknown) => { run() },
      } as unknown as ClientContext
      if (upstreamFirst) core.register(upstream, Upstream)
      expect(() => { apply(ctx) }).not.toThrow()
      if (!upstreamFirst) core.register(upstream, Upstream)
      const winners = core.entriesOfSlot('conversation.chat.node').filter(entry => entry.options.key === 'turn-error')
      expect(winners.map(entry => entry.component)).toEqual([TurnFailureView])
    }
  })
})
