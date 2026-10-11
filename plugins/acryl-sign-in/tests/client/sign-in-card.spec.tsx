// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SignInAttemptView } from 'acryl-control'
import { SignInCard } from '../../src/client/SignInCard.tsx'
import { createSignInApi, type SignInApi } from '../../src/client/sign-in-api.ts'
import { en } from '../../src/client/locales.ts'

afterEach(cleanup)

const t = (key: keyof typeof en): string => en[key]
const PROVIDERS = {
  signedIn: false,
  providers: [
    { key: 'llm-pi-ai/anthropic', label: 'Anthropic', methods: [{ id: 'oauth', label: 'Anthropic (Claude Pro/Max)' }, { id: 'api-key', label: 'Anthropic API key' }], configured: false },
    { key: 'llm-pi-ai/openai', label: 'OpenAI', methods: [{ id: 'oauth', label: 'Sign in with ChatGPT' }, { id: 'api-key', label: 'OpenAI API key' }], configured: true },
    { key: 'llm-pi-ai/openai-codex', label: 'OpenAI Codex (legacy)', methods: [{ id: 'oauth', label: 'OpenAI (ChatGPT Plus/Pro)' }], configured: false },
    { key: 'llm-pi-ai/github-copilot', label: 'GitHub Copilot', methods: [{ id: 'oauth', label: 'GitHub Copilot' }], configured: false },
    { key: 'llm-pi-ai/mistral', label: 'Mistral', methods: [{ id: 'api-key', label: 'Mistral API key' }], configured: false },
    { key: 'deepseek-account-platform/default', label: 'DeepSeek', methods: [{ id: 'oauth', label: 'DeepSeek account' }], configured: false },
  ],
}
const running = (extra: Partial<SignInAttemptView> = {}): SignInAttemptView => ({ id: 'a1', key: 'llm-pi-ai/anthropic', method: 'oauth', phase: 'running', notices: [], ...extra })

function api(overrides: Partial<SignInApi> = {}): SignInApi {
  return {
    providers: vi.fn(async () => PROVIDERS),
    attempt: vi.fn(async () => null),
    begin: vi.fn(async () => running()),
    answer: vi.fn(async () => running()),
    cancel: vi.fn(async () => running({ phase: 'cancelled' })),
    ...overrides,
  }
}

function mount(signIn: SignInApi, extra: { openExternal?: (url: string) => void } = {}) {
  const props = { api: signIn, t, openExternal: extra.openExternal ?? vi.fn(), copy: vi.fn(async () => {}), language: () => 'zh-CN' }
  return render(<SignInCard {...(props as unknown as Parameters<typeof SignInCard>[0])} />)
}

describe('SignInCard', () => {
  it('names Claude and ChatGPT first, DeepSeek next, other OAuth providers in a list, and leaves API-key-only providers out', async () => {
    mount(api())
    await screen.findByText('Claude')
    expect(screen.getByText('ChatGPT')).toBeTruthy()
    expect(screen.getByText('DeepSeek')).toBeTruthy()
    expect(screen.getByText('Signed in')).toBeTruthy()
    const options = [...screen.getByRole('combobox').querySelectorAll('option')].map(option => option.textContent)
    expect(options).toContain('GitHub Copilot')
    expect(options).toContain('OpenAI Codex (legacy)')
    expect(options.join(' ')).not.toContain('Mistral')
  })

  it('starts the OAuth method, opens the sign-in page once and keeps it on the card', async () => {
    const openExternal = vi.fn()
    const withUrl = running({ notices: [{ message: 'Open the page', url: 'https://claude.ai/oauth/authorize?x=1' }] })
    let started = false
    const signIn = api({ begin: vi.fn(async () => { started = true; return withUrl }), attempt: vi.fn(async () => started ? withUrl : null) })
    mount(signIn, { openExternal })
    await screen.findByText('Claude')
    fireEvent.click(screen.getAllByRole('button', { name: 'Sign in' })[0]!)
    await screen.findByText('Continue in your browser')
    expect(signIn.begin).toHaveBeenCalledWith('llm-pi-ai/anthropic', 'oauth', 'zh-CN')
    expect(openExternal).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Open sign-in page' }))
    expect(openExternal).toHaveBeenLastCalledWith('https://claude.ai/oauth/authorize?x=1')
  })

  it('answers the flow\'s question', async () => {
    const asking = running({ prompt: { id: 'p1', kind: 'text', message: 'Paste the code:' } })
    const signIn = api({ begin: vi.fn(async () => asking) })
    mount(signIn)
    await screen.findByText('Claude')
    fireEvent.click(screen.getAllByRole('button', { name: 'Sign in' })[0]!)
    fireEvent.change(await screen.findByLabelText('Paste the code'), { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => { expect(signIn.answer).toHaveBeenCalledWith('a1', 'p1', 'abc') })
  })

  it('signs in to DeepSeek\'s account through the same routes, with the UI language', async () => {
    const signIn = api()
    mount(signIn)
    await screen.findByText('Claude')
    // Sign in: Claude, DeepSeek, the other-provider list (ChatGPT is already signed in and offers Sign in again).
    fireEvent.click(screen.getAllByRole('button', { name: 'Sign in' })[1]!)
    await waitFor(() => { expect(signIn.begin).toHaveBeenCalledWith('deepseek-account-platform/default', 'oauth', 'zh-CN') })
    const options = [...screen.getByRole('combobox').querySelectorAll('option')].map(option => option.textContent)
    expect(options).not.toContain('DeepSeek')
  })

  it('reports a refused start in words', async () => {
    mount(api({ begin: vi.fn(async () => { throw new Error('That provider cannot be signed into.') }) }))
    await screen.findByText('Claude')
    fireEvent.click(screen.getAllByRole('button', { name: 'Sign in' })[0]!)
    await screen.findByText('Sign-in did not finish')
    expect(screen.getByText('That provider cannot be signed into.')).toBeTruthy()
  })
})

describe('createSignInApi', () => {
  it('posts same-origin JSON and returns the attempt; a refusal carries the Host\'s words', async () => {
    const fetchImpl = vi.fn(async (_path: string, init?: RequestInit) => init?.method === 'POST'
      ? new Response(JSON.stringify({ attempt: running() }), { status: 200 })
      : new Response(JSON.stringify({ error: 'That provider cannot be signed into.' }), { status: 409 }))
    const signIn = createSignInApi(fetchImpl)
    expect((await signIn.begin('llm-pi-ai/anthropic', 'oauth')).id).toBe('a1')
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ method: 'POST', credentials: 'same-origin', body: '{"key":"llm-pi-ai/anthropic","method":"oauth"}' })
    await expect(signIn.providers()).rejects.toThrow('That provider cannot be signed into.')
  })
})

describe('SignInCard resuming', () => {
  it('picks up a sign-in that was already running when the page opened', async () => {
    mount(api({ attempt: vi.fn(async () => running({ notices: [{ message: 'Open', url: 'https://claude.ai/oauth/authorize' }] })) }))
    await screen.findByText('Continue in your browser')
  })
})
