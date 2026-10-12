/**
 * Choosing a provider in `/login` that is already signed in with an account signs in again in the browser, as other coding agents do;
 * it used to open the API-key provider editor, which showed an invented protocol for a built-in provider (owner, 2026-10-12).
 */
import { describe, expect, it, vi } from 'vitest'
import type { TUI } from '@earendil-works/pi-tui'
import type { TuiActions } from '../../src/tui/actions.js'
import { LoginOverlay } from '../../src/tui/login/LoginOverlay.js'
import { ModelProfileOverlay } from '../../src/tui/modelProfile/ModelProfileOverlay.js'
import type { ProviderDraft } from '../../src/tui/modelProfile/types.js'
import { TuiStore } from '../../src/tui/store.js'

const ENTER = '\r'
const tui = { terminal: { rows: 40, columns: 120 }, requestRender() {} } as unknown as TUI

function actions(): TuiActions {
  return new Proxy({}, { get: (target: Record<string, unknown>, name: string) => (target[name] ??= vi.fn()) }) as unknown as TuiActions
}

const anthropic = (authMethod: 'oauth' | 'api-key') => ({
  key: 'llm-pi-ai/anthropic', label: 'Anthropic', inFlight: false, configured: true, authMethod,
  methods: [{ id: 'oauth', label: 'Sign in' }, { id: 'api-key', label: 'API key' }],
})

function loginWith(flow: ReturnType<typeof anthropic>) {
  const store = new TuiStore({ events: [] })
  const act = actions()
  const overlay = new LoginOverlay(tui, store, act)
  store.openLogin()
  store.updateLogin({ flows: [flow], busy: false })
  overlay.render(120)
  return { store, act, overlay }
}

describe('/login on a provider already signed in', () => {
  it('signs in again in the browser when it is signed in with an account', () => {
    const { act, overlay } = loginWith(anthropic('oauth'))
    overlay.handleInput(ENTER) // Sign in with an account
    overlay.handleInput(ENTER) // Anthropic
    expect(act.beginAuthorization).toHaveBeenCalledWith('llm-pi-ai/anthropic', 'oauth')
    expect(act.openProviderEditor).not.toHaveBeenCalled()
  })

  it('opens the key and models of a provider configured with an API key', () => {
    const { act, overlay } = loginWith(anthropic('api-key'))
    overlay.handleInput('\x1b[B') // Sign in with an API key
    overlay.handleInput(ENTER)
    overlay.handleInput(ENTER)
    expect(act.openProviderEditor).toHaveBeenCalledWith('anthropic')
  })

  it('cancels the sign-in on Escape at its prompt, instead of answering it with nothing', () => {
    const { store, act, overlay } = loginWith(anthropic('oauth'))
    store.updateLogin({ prompt: { kind: 'text', message: 'Paste the redirect URL', placeholder: undefined } })
    overlay.handleInput('\x1b')
    expect(act.cancelAuthorization).toHaveBeenCalled()
    expect(act.answerAuthorizationPrompt).not.toHaveBeenCalled()
  })

  it('shows every line of a notice, so the page to open is on screen', () => {
    const { store, overlay } = loginWith(anthropic('oauth'))
    store.setNotice('Complete login in your browser.\nhttps://claude.ai/oauth/authorize?x=1')
    expect(overlay.render(120).join('\n')).toContain('https://claude.ai/oauth/authorize?x=1')
    // Wider than the terminal: wrapped, never cut.
    const long = `https://claude.ai/oauth/authorize?${'a'.repeat(150)}`
    store.setNotice(`Complete login in your browser.\n${long}`)
    const rows = overlay.render(60)
    expect(rows.every(row => row.replace(/\x1b\[[0-9;]*m/g, '').length <= 60)).toBe(true)
    expect(rows.map(row => row.replace(/\x1b\[[0-9;]*m/g, '')).join('')).toContain(long)
  })
})

const draft = (patch: Partial<ProviderDraft>): ProviderDraft => ({
  route: 'anthropic', isNew: false, settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'anthropic'], displayName: 'anthropic', api: '', baseURL: '',
  apiKeyRef: 'ANTHROPIC_API_KEY', apiKeyConfigured: true, authMethod: 'oauth', apiKeyDraft: '', apiKeyPreview: undefined, models: [], revision: undefined, ...patch,
})

function editorWith(value: ProviderDraft) {
  const store = new TuiStore({ events: [] })
  const act = actions()
  const overlay = new ModelProfileOverlay(tui, store, act)
  store.openModelProfile()
  store.updateModelProfile({ view: 'form', draft: value, formKey: 1, busy: false })
  return { act, overlay, text: () => overlay.render(120).join('\n') }
}

describe('/model on a provider', () => {
  it('shows an account sign-in as an account, not as fields to edit: enter signs in again, ctrl+d signs out', () => {
    const { act, overlay, text } = editorWith(draft({}))
    expect(text()).toContain('Signed in with your account')
    expect(text()).not.toContain('API protocol')
    overlay.handleInput(ENTER)
    expect(act.signInAgain).toHaveBeenCalledWith('anthropic')
    overlay.handleInput('\x04')
    expect(act.clearApiKey).toHaveBeenCalled()
  })

  it('keeps a built-in provider\'s own protocol instead of showing and saving another one', () => {
    const { act, overlay, text } = editorWith(draft({ authMethod: 'api-key' }))
    expect(text()).toContain("API protocol: ‹ the provider's default ›")
    for (let i = 0; i < 8 && !text().includes('› Save changes'); i++) overlay.handleInput('\t')
    overlay.handleInput(ENTER)
    expect(act.saveProvider).toHaveBeenCalledWith(expect.objectContaining({ api: '' }))
  })
})
