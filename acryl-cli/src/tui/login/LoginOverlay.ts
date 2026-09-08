/**
 * `/login` overlay: a pi.dev-style two-step sign-in flow over the
 * `ctx.authorization` flows (Anthropic, OpenAI Codex, GitHub Copilot, …)
 * registered by `dsh-llm-pi-ai`. Step one asks "sign in with an account"
 * (OAuth) vs "sign in with an API key"; step two shows the fuzzy-searchable
 * provider list for that method, filtered from the same flow list step one
 * partitioned. If every registered flow only offers one of the two method
 * types, step one is skipped automatically (there's nothing to choose).
 * Selecting a provider and pressing enter runs its flow through
 * `ctx.authorization.begin`, which drives pi-ai's own OAuth/API-key
 * strategies and persists the grant. While a flow is running it may ask a
 * question (a `select` account picker, a `secret` API-key field, or a
 * `text` manual-code field) — the overlay renders that prompt inline and
 * routes keystrokes to it until the flow settles.
 * @module @tomowang/dsh-tui/tui/login/LoginOverlay
 */

import type { Component, TUI } from '@earendil-works/pi-tui'
import { Key, matchesKey, fuzzyFilter } from '@earendil-works/pi-tui'
import type { AuthMethod } from 'acryl-control'
import type { TuiActions } from '../actions.js'
import type { TuiStore } from '../store.js'
import { emptyMiniTextField, miniTextFieldInput, renderMiniTextField, type MiniTextFieldState } from '../miniTextField.js'
import { listWindow, visibleRange } from '../listWindow.js'
import type { AuthorizationFlowRow, LoginOverlayState, LoginPromptState } from './types.js'
import { theme, fg } from '../theme.js'

const bold = (s: string): string => `\x1b[1m${s}\x1b[0m`
const secondary = fg(theme.secondary)
const muted = fg(theme.muted)
const errorColor = fg(theme.error)
const successColor = fg(theme.success)
const invert = (s: string): string => `\x1b[7m${s}\x1b[0m`

/** A non-secret reminder that replacing an API-key prompt will overwrite an existing stored key. */
export function formatStoredApiKeyHint(preview: string | undefined): string | undefined {
  return preview === undefined ? undefined : `Stored key: ${preview}`
}

const AUTH_TYPES: readonly AuthMethod[] = ['oauth', 'api-key']
const AUTH_TYPE_LABELS: Record<AuthMethod, string> = {
  oauth: 'Sign in with an account',
  'api-key': 'Sign in with an API key',
}

/**
 * The overlay's own step state, as a discriminated union rather than a loose
 * field cluster (specs/001-acryl-refactor-improvements-and-tech-debt, R8):
 * each variant carries exactly the fields that step owns, so they can never
 * drift inconsistent (e.g. `chooserSkipped` true while still on the chooser).
 * `chooserSkipped` lives inside the `list` variant because it only has
 * meaning once step two is reached — it decides what Escape does from there.
 */
type LoginViewState =
  | { readonly kind: 'authType'; readonly cursor: number }
  | {
      readonly kind: 'list'
      readonly authType: AuthMethod | undefined
      readonly chooserSkipped: boolean
      readonly cursor: number
      readonly searchQuery: MiniTextFieldState
    }

export class LoginOverlay implements Component {
  // The one step-machine field this overlay owns; every render/handleInput
  // call reads it through `effectiveView` (a pure computation — never
  // mutated inside `render()`, only ever reassigned from `handleInput`).
  private view: LoginViewState = { kind: 'authType', cursor: 0 }

  // Prompt-mode local state: the single-line field for text/secret prompts and
  // the cursor for select prompts. Reinitialized when a fresh prompt arrives.
  private promptField: MiniTextFieldState = emptyMiniTextField()
  private promptCursor = 0

  constructor(
    private readonly tui: TUI,
    private readonly store: TuiStore,
    private readonly actions: TuiActions,
  ) {}

  invalidate(): void {}

  /**
   * The global one-line notice (`store.setNotice`), rendered inline here.
   * `/login` runs as a full-screen overlay that paints over the whole
   * terminal, so the notice dock underneath — where sign-in progress,
   * success ("Signed in to X."), and failure text otherwise land — is
   * completely hidden for as long as this overlay stays open. Surfacing it
   * here is what makes an OAuth callback's result actually visible instead
   * of the screen appearing to do nothing once the browser redirects back.
   */
  private noticeLines(): string[] {
    const notice = this.store.getSnapshot().notice
    return notice === undefined ? [] : [muted(notice)]
  }

  /**
   * Pure: given the loaded flows, which single method (if any) they all
   * share — the chooser has nothing to offer when only one method type is
   * registered at all. Recomputed fresh every call (no cached/latched
   * result), so a later-refreshed flow set is always re-evaluated instead of
   * replaying a stale decision (specs/001-…, R6).
   */
  private autoSkipAuthType(login: LoginOverlayState): AuthMethod | undefined {
    if (login.flows === undefined) return undefined
    const hasOAuth = login.flows.some(flow => flow.methods.some(method => method.id === 'oauth'))
    const hasApiKey = login.flows.some(flow => flow.methods.some(method => method.id === 'api-key'))
    return hasOAuth === hasApiKey ? undefined : (hasOAuth ? 'oauth' : 'api-key') // both or neither present: let the user choose
  }

  /**
   * Pure: the view to actually render/operate against. `this.view` stays the
   * untouched `authType` default until the user explicitly chooses (Enter on
   * the chooser) — until then, this derives the auto-skipped `list` view on
   * every call instead of mutating `this.view` from inside `render()`. The
   * first `handleInput` mutation against a derived (not-yet-explicit) `list`
   * view reassigns `this.view` directly (see `handleProviderListInput`), so
   * cursor/search state persists across renders once the user interacts.
   */
  private effectiveView(login: LoginOverlayState): LoginViewState {
    if (this.view.kind === 'authType') {
      const auto = this.autoSkipAuthType(login)
      if (auto !== undefined) return { kind: 'list', authType: auto, chooserSkipped: true, cursor: 0, searchQuery: emptyMiniTextField() }
    }
    return this.view
  }

  private filteredFlows(login: LoginOverlayState, view: Extract<LoginViewState, { kind: 'list' }>): readonly AuthorizationFlowRow[] {
    const all = login.flows ?? []
    const byType = view.authType === undefined ? all : all.filter(flow => flow.methods.some(method => method.id === view.authType))
    const query = view.searchQuery.value.trim()
    return query === '' ? byType : fuzzyFilter([...byType], query, flow => flow.label)
  }

  private renderAuthTypeChooser(login: LoginOverlayState, view: Extract<LoginViewState, { kind: 'authType' }>): string[] {
    const lines: string[] = [bold(secondary('Select authentication method'))]
    lines.push(...this.noticeLines())
    if (login.error !== undefined) lines.push(errorColor(login.error))
    if (login.busy && login.flows === undefined) lines.push(muted('Loading…'))
    AUTH_TYPES.forEach((type, index) => {
      const text = `${index === view.cursor ? '› ' : '  '}${AUTH_TYPE_LABELS[type]}`
      lines.push(index === view.cursor ? invert(text) : text)
    })
    lines.push(muted('↑↓ select · enter continue · esc close'))
    return lines
  }

  private renderProviderList(login: LoginOverlayState, view: Extract<LoginViewState, { kind: 'list' }>): string[] {
    const lines: string[] = [bold(secondary('Select provider to configure:'))]
    lines.push(...this.noticeLines())
    if (login.error !== undefined) lines.push(errorColor(login.error))
    lines.push(`> ${renderMiniTextField(view.searchQuery, true)}`)
    if (login.busy && login.flows === undefined) lines.push(muted('Loading…'))
    const flows = this.filteredFlows(login, view)
    const chrome = lines.length + 2 // lines pushed so far, plus this list's own final hint line and the "N/total" indicator
    const maxVisible = listWindow(this.tui.terminal.rows, chrome)
    const { start, end } = visibleRange(flows.length, view.cursor, maxVisible)
    flows.slice(start, end).forEach((flow, offset) => {
      const index = start + offset
      const marker = flow.inFlight ? '· ' : flow.configured ? '✓ ' : '○ '
      const signingIn = login.signingIn === flow.key ? ' — signing in…' : ''
      const via = flow.authMethod === 'oauth' ? ' [oauth]' : flow.authMethod === 'api-key' ? ' [api]' : ''
      const readyNote = login.signingIn !== flow.key && flow.configured ? ` — ready to use${via}` : ''
      const text = `${index === view.cursor ? '› ' : '  '}${marker}${flow.label}${signingIn}${readyNote}`
      lines.push(index === view.cursor ? invert(text) : flow.configured ? successColor(text) : text)
    })
    if (flows.length > maxVisible) lines.push(muted(`(${view.cursor + 1}/${flows.length})`))
    if (login.flows !== undefined && flows.length === 0) lines.push(muted('No matching providers.'))
    const back = view.chooserSkipped ? 'esc close' : 'esc back'
    lines.push(muted(`type to search · ↑↓ select · enter sign in (or edit key/models if already configured) · ctrl+p add custom provider · ${back}`))
    return lines
  }

  private renderPrompt(prompt: LoginPromptState): string[] {
    const lines: string[] = [bold(secondary('Sign in'))]
    lines.push(...this.noticeLines())
    lines.push(prompt.message)
    if (prompt.kind === 'select') {
      prompt.options.forEach((option, index) => {
        const row = `${index === this.promptCursor ? '› ' : '  '}${option.label}`
        lines.push(index === this.promptCursor ? invert(row) : row)
        if (option.description !== undefined) lines.push(muted(`    ${option.description}`))
      })
      lines.push(muted('↑↓ choose · enter select · esc cancel'))
    } else {
      const mask = prompt.kind === 'secret' ? '•' : undefined
      const placeholder = prompt.placeholder ?? (prompt.kind === 'secret' ? 'API key' : 'code')
      const field = this.promptField.value === '' ? `(${placeholder})` : renderMiniTextField(this.promptField, true, mask)
      const storedKeyHint = prompt.kind === 'secret' ? formatStoredApiKeyHint(prompt.storedApiKeyPreview) : undefined
      if (storedKeyHint !== undefined) lines.push(muted(storedKeyHint))
      lines.push(`> ${field}`)
      lines.push(muted('escape/ctrl+c to cancel, enter to submit'))
    }
    return lines
  }

  render(_width: number): string[] {
    const overlay = this.store.getSnapshot().overlay
    if (overlay.kind !== 'login') return []
    const { login } = overlay
    if (login.prompt !== undefined) return this.renderPrompt(login.prompt)
    const view = this.effectiveView(login)
    return view.kind === 'authType' ? this.renderAuthTypeChooser(login, view) : this.renderProviderList(login, view)
  }

  handleInput(data: string): void {
    const overlay = this.store.getSnapshot().overlay
    if (overlay.kind !== 'login') return
    const { login } = overlay
    if (login.prompt !== undefined) {
      this.handlePromptInput(data, login.prompt)
      return
    }
    const view = this.effectiveView(login)
    if (view.kind === 'authType') this.handleAuthTypeChooserInput(data, view)
    else this.handleProviderListInput(data, login, view)
  }

  private handlePromptInput(data: string, prompt: LoginPromptState): void {
    if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl('c'))) {
      this.actions.answerAuthorizationPrompt('')
      return
    }
    if (prompt.kind === 'select') {
      if (matchesKey(data, Key.up)) { this.promptCursor = Math.max(0, this.promptCursor - 1); return }
      if (matchesKey(data, Key.down)) { this.promptCursor = Math.min(prompt.options.length - 1, this.promptCursor + 1); return }
      if (matchesKey(data, Key.enter)) { this.actions.answerAuthorizationPrompt(prompt.options[this.promptCursor]!.id) }
      return
    }
    if (matchesKey(data, Key.enter)) { this.actions.answerAuthorizationPrompt(this.promptField.value.trim()); return }
    const next = miniTextFieldInput(this.promptField, data)
    if (next !== undefined) this.promptField = next
  }

  private handleAuthTypeChooserInput(data: string, view: Extract<LoginViewState, { kind: 'authType' }>): void {
    if (matchesKey(data, Key.escape)) {
      this.actions.closeLogin()
      return
    }
    if (matchesKey(data, Key.up)) { this.view = { kind: 'authType', cursor: Math.max(0, view.cursor - 1) }; return }
    if (matchesKey(data, Key.down)) { this.view = { kind: 'authType', cursor: Math.min(AUTH_TYPES.length - 1, view.cursor + 1) }; return }
    if (matchesKey(data, Key.enter)) {
      this.view = { kind: 'list', authType: AUTH_TYPES[view.cursor], chooserSkipped: false, cursor: 0, searchQuery: emptyMiniTextField() }
    }
  }

  private handleProviderListInput(data: string, login: LoginOverlayState, view: Extract<LoginViewState, { kind: 'list' }>): void {
    if (matchesKey(data, Key.escape)) {
      if (view.chooserSkipped) {
        this.actions.closeLogin()
      } else {
        this.view = { kind: 'authType', cursor: 0 }
      }
      return
    }
    // Modifier combo, not a bare letter — every letter is valid search text
    // here (same reasoning as `/model`'s own Ctrl+P: a provider named
    // starting with "p" must stay typeable), and matching `/model`'s own key
    // for the same action means one shortcut to remember for "add a custom
    // provider" everywhere it's offered.
    if (matchesKey(data, Key.ctrl('p'))) {
      this.actions.addCustomProvider()
      return
    }
    const flows = this.filteredFlows(login, view)
    if (matchesKey(data, Key.up)) { this.view = { ...view, cursor: Math.max(0, view.cursor - 1) }; return }
    if (matchesKey(data, Key.down)) { this.view = { ...view, cursor: Math.min(Math.max(0, flows.length - 1), view.cursor + 1) }; return }
    // An already-configured provider's key/models live in /model, not here —
    // this jumps straight to that provider's edit form (masked key preview,
    // Models editor) instead of making the user separately learn /model's own
    // navigation to reach the exact route they just selected here.
    if (matchesKey(data, Key.ctrl('e'))) {
      const flow = flows[view.cursor]
      if (flow !== undefined && flow.configured && flow.key.startsWith('llm-pi-ai/')) {
        this.actions.openProviderEditor(flow.key.slice('llm-pi-ai/'.length))
      }
      return
    }
    if (matchesKey(data, Key.enter)) {
      const flow = flows[view.cursor]
      if (flow === undefined) return
      // A configured route has nothing left to "sign in" to — re-running
      // authorization blindly (no indication anything was already there) is
      // almost never what selecting it means. Show what's actually stored
      // instead, the same screen ctrl+e opens; only an unconfigured route
      // still starts a fresh sign-in.
      if (flow.configured && flow.key.startsWith('llm-pi-ai/')) {
        this.actions.openProviderEditor(flow.key.slice('llm-pi-ai/'.length))
      } else {
        this.actions.beginAuthorization(flow.key, view.authType)
      }
      return
    }
    const next = miniTextFieldInput(view.searchQuery, data)
    if (next !== undefined) {
      this.view = { ...view, searchQuery: next, cursor: 0 }
    }
  }
}
