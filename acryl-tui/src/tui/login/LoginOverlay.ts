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
import type { TuiActions } from '../actions.js'
import type { TuiStore } from '../store.js'
import { emptyMiniTextField, miniTextFieldInput, renderMiniTextField, type MiniTextFieldState } from '../miniTextField.js'
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

type AuthType = 'oauth' | 'api-key'

const AUTH_TYPES: readonly AuthType[] = ['oauth', 'api-key']
const AUTH_TYPE_LABELS: Record<AuthType, string> = {
  oauth: 'Sign in with an account',
  'api-key': 'Sign in with an API key',
}

export class LoginOverlay implements Component {
  // Step-one (auth-type chooser) local state.
  private step: 'authType' | 'list' = 'authType'
  private authType: AuthType | undefined
  private authTypeCursor = 0
  // Whether step one was skipped because the loaded flows only offered one
  // method type — determines whether Escape from the list goes back to the
  // chooser or closes the overlay outright.
  private chooserSkipped = false
  private autoSkipChecked = false

  // Step-two (fuzzy provider list) local state.
  private listCursor = 0
  private searchQuery: MiniTextFieldState = emptyMiniTextField()

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

  /** See `ModelProfileOverlay.listWindow` — same overflow bug, same fix: a long provider list (~35 catalog entries) must never push the key-legend hint line past the bottom of the terminal. */
  private listWindow(chrome: number): number {
    return Math.max(3, this.tui.terminal.rows - chrome)
  }

  /** The `[start, end)` slice of `count` items to show so `selected` stays visible within `maxVisible` rows, biased to keep it centered. */
  private visibleRange(count: number, selected: number, maxVisible: number): { start: number; end: number } {
    if (count <= maxVisible) return { start: 0, end: count }
    const start = Math.max(0, Math.min(selected - Math.floor(maxVisible / 2), count - maxVisible))
    return { start, end: start + maxVisible }
  }

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

  /** Partition the loaded flows by method type, once, the first time they arrive; auto-advances past the chooser if only one type is on offer. */
  private maybeAutoSkipChooser(login: LoginOverlayState): void {
    if (this.autoSkipChecked || login.flows === undefined) return
    this.autoSkipChecked = true
    const hasOAuth = login.flows.some(flow => flow.methods.some(method => method.id === 'oauth'))
    const hasApiKey = login.flows.some(flow => flow.methods.some(method => method.id === 'api-key'))
    if (hasOAuth === hasApiKey) return // both or neither present: let the user choose
    this.authType = hasOAuth ? 'oauth' : 'api-key'
    this.step = 'list'
    this.chooserSkipped = true
  }

  private filteredFlows(login: LoginOverlayState): readonly AuthorizationFlowRow[] {
    const all = login.flows ?? []
    const byType = this.authType === undefined ? all : all.filter(flow => flow.methods.some(method => method.id === this.authType))
    const query = this.searchQuery.value.trim()
    return query === '' ? byType : fuzzyFilter([...byType], query, flow => flow.label)
  }

  private renderAuthTypeChooser(login: LoginOverlayState): string[] {
    const lines: string[] = [bold(secondary('Select authentication method'))]
    lines.push(...this.noticeLines())
    if (login.error !== undefined) lines.push(errorColor(login.error))
    if (login.busy && login.flows === undefined) lines.push(muted('Loading…'))
    AUTH_TYPES.forEach((type, index) => {
      const text = `${index === this.authTypeCursor ? '› ' : '  '}${AUTH_TYPE_LABELS[type]}`
      lines.push(index === this.authTypeCursor ? invert(text) : text)
    })
    lines.push(muted('↑↓ select · enter continue · esc close'))
    return lines
  }

  private renderProviderList(login: LoginOverlayState): string[] {
    const lines: string[] = [bold(secondary('Select provider to configure:'))]
    lines.push(...this.noticeLines())
    if (login.error !== undefined) lines.push(errorColor(login.error))
    lines.push(`> ${renderMiniTextField(this.searchQuery, true)}`)
    if (login.busy && login.flows === undefined) lines.push(muted('Loading…'))
    const flows = this.filteredFlows(login)
    const chrome = lines.length + 2 // lines pushed so far, plus this list's own final hint line and the "N/total" indicator
    const maxVisible = this.listWindow(chrome)
    const { start, end } = this.visibleRange(flows.length, this.listCursor, maxVisible)
    flows.slice(start, end).forEach((flow, offset) => {
      const index = start + offset
      const marker = flow.inFlight ? '· ' : flow.configured ? '✓ ' : '○ '
      const signingIn = login.signingIn === flow.key ? ' — signing in…' : ''
      const via = flow.authMethod === 'oauth' ? ' [oauth]' : flow.authMethod === 'api-key' ? ' [api]' : ''
      const readyNote = login.signingIn !== flow.key && flow.configured ? ` — ready to use${via}` : ''
      const text = `${index === this.listCursor ? '› ' : '  '}${marker}${flow.label}${signingIn}${readyNote}`
      lines.push(index === this.listCursor ? invert(text) : flow.configured ? successColor(text) : text)
    })
    if (flows.length > maxVisible) lines.push(muted(`(${this.listCursor + 1}/${flows.length})`))
    if (login.flows !== undefined && flows.length === 0) lines.push(muted('No matching providers.'))
    const back = this.chooserSkipped ? 'esc close' : 'esc back'
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
    this.maybeAutoSkipChooser(login)
    return this.step === 'authType' ? this.renderAuthTypeChooser(login) : this.renderProviderList(login)
  }

  handleInput(data: string): void {
    const overlay = this.store.getSnapshot().overlay
    if (overlay.kind !== 'login') return
    const { login } = overlay
    if (login.prompt !== undefined) {
      this.handlePromptInput(data, login.prompt)
      return
    }
    if (this.step === 'authType') this.handleAuthTypeChooserInput(data)
    else this.handleProviderListInput(data, login)
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

  private handleAuthTypeChooserInput(data: string): void {
    if (matchesKey(data, Key.escape)) {
      this.actions.closeLogin()
      return
    }
    if (matchesKey(data, Key.up)) { this.authTypeCursor = Math.max(0, this.authTypeCursor - 1); return }
    if (matchesKey(data, Key.down)) { this.authTypeCursor = Math.min(AUTH_TYPES.length - 1, this.authTypeCursor + 1); return }
    if (matchesKey(data, Key.enter)) {
      this.authType = AUTH_TYPES[this.authTypeCursor]
      this.step = 'list'
      this.listCursor = 0
      this.searchQuery = emptyMiniTextField()
    }
  }

  private handleProviderListInput(data: string, login: LoginOverlayState): void {
    if (matchesKey(data, Key.escape)) {
      if (this.chooserSkipped) {
        this.actions.closeLogin()
      } else {
        this.step = 'authType'
        this.searchQuery = emptyMiniTextField()
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
    const flows = this.filteredFlows(login)
    if (matchesKey(data, Key.up)) { this.listCursor = Math.max(0, this.listCursor - 1); return }
    if (matchesKey(data, Key.down)) { this.listCursor = Math.min(Math.max(0, flows.length - 1), this.listCursor + 1); return }
    // An already-configured provider's key/models live in /model, not here —
    // this jumps straight to that provider's edit form (masked key preview,
    // Models editor) instead of making the user separately learn /model's own
    // navigation to reach the exact route they just selected here.
    if (matchesKey(data, Key.ctrl('e'))) {
      const flow = flows[this.listCursor]
      if (flow !== undefined && flow.configured && flow.key.startsWith('llm-pi-ai/')) {
        this.actions.openProviderEditor(flow.key.slice('llm-pi-ai/'.length))
      }
      return
    }
    if (matchesKey(data, Key.enter)) {
      const flow = flows[this.listCursor]
      if (flow === undefined) return
      // A configured route has nothing left to "sign in" to — re-running
      // authorization blindly (no indication anything was already there) is
      // almost never what selecting it means. Show what's actually stored
      // instead, the same screen ctrl+e opens; only an unconfigured route
      // still starts a fresh sign-in.
      if (flow.configured && flow.key.startsWith('llm-pi-ai/')) {
        this.actions.openProviderEditor(flow.key.slice('llm-pi-ai/'.length))
      } else {
        this.actions.beginAuthorization(flow.key, this.authType)
      }
      return
    }
    const next = miniTextFieldInput(this.searchQuery, data)
    if (next !== undefined) {
      this.searchQuery = next
      this.listCursor = 0
    }
  }
}
