/**
 * `/login` overlay: the list of `ctx.authorization` sign-in flows (Anthropic,
 * OpenAI Codex, GitHub Copilot, …) registered by `dsh-llm-pi-ai`. Selecting one
 * and pressing enter runs its flow through `ctx.authorization.begin`, which
 * drives pi-ai's own OAuth strategies and persists the grant. While a flow is
 * running it may ask a question (a `select` account picker, a `secret` API-key
 * field, or a `text` manual-code field) — the overlay renders that prompt
 * inline and routes keystrokes to it until the flow settles.
 * @module @tomowang/dsh-tui/tui/login/LoginOverlay
 */

import type { Component } from '@earendil-works/pi-tui'
import { Key, matchesKey } from '@earendil-works/pi-tui'
import type { TuiActions } from '../actions.js'
import type { TuiStore } from '../store.js'
import { emptyMiniTextField, miniTextFieldInput, renderMiniTextField, type MiniTextFieldState } from '../miniTextField.js'
import type { LoginOverlayState, LoginPromptState } from './types.js'
import { theme, fg } from '../theme.js'

const bold = (s: string): string => `\x1b[1m${s}\x1b[0m`
const secondary = fg(theme.secondary)
const muted = fg(theme.muted)
const errorColor = fg(theme.error)
const invert = (s: string): string => `\x1b[7m${s}\x1b[0m`

export class LoginOverlay implements Component {
  // Prompt-mode local state: the single-line field for text/secret prompts and
  // the cursor for select prompts. Reinitialized when a fresh prompt arrives.
  private promptField: MiniTextFieldState = emptyMiniTextField()
  private promptCursor = 0

  constructor(
    private readonly store: TuiStore,
    private readonly actions: TuiActions,
  ) {}

  invalidate(): void {}

  private renderList(login: LoginOverlayState): string[] {
    const lines: string[] = [bold(secondary('Sign in'))]
    if (login.error !== undefined) lines.push(errorColor(login.error))
    if (login.busy && login.flows === undefined) lines.push(muted('Loading…'))
    login.flows?.forEach((flow, index) => {
      const marker = flow.inFlight ? '· ' : '○ '
      const signingIn = login.signingIn === flow.key ? ' — signing in…' : ''
      const text = `${index === login.selected ? '› ' : '  '}${marker}${flow.label}${signingIn}`
      lines.push(index === login.selected ? invert(text) : text)
    })
    if (login.flows?.length === 0) lines.push(muted('No sign-in providers are available in this profile.'))
    lines.push(muted('↑↓ select · enter sign in · esc close'))
    return lines
  }

  private renderPrompt(prompt: LoginPromptState): string[] {
    const lines: string[] = [bold(secondary('Sign in'))]
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
      lines.push(`> ${field}`)
      lines.push(muted('type + enter submit · esc cancel'))
    }
    return lines
  }

  render(_width: number): string[] {
    const overlay = this.store.getSnapshot().overlay
    if (overlay.kind !== 'login') return []
    const { prompt } = overlay.login
    return prompt === undefined ? this.renderList(overlay.login) : this.renderPrompt(prompt)
  }

  handleInput(data: string): void {
    const overlay = this.store.getSnapshot().overlay
    if (overlay.kind !== 'login') return
    const { prompt } = overlay.login
    if (prompt !== undefined) this.handlePromptInput(data, prompt)
    else this.handleListInput(data, overlay.login)
  }

  private handlePromptInput(data: string, prompt: LoginPromptState): void {
    if (matchesKey(data, Key.escape)) {
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

  private handleListInput(data: string, login: LoginOverlayState): void {
    if (matchesKey(data, Key.escape)) {
      this.actions.closeLogin()
      return
    }
    const flows = login.flows
    if (flows === undefined || flows.length === 0) return
    if (matchesKey(data, Key.up)) {
      this.actions.selectLoginFlow(Math.max(0, login.selected - 1))
      return
    }
    if (matchesKey(data, Key.down)) {
      this.actions.selectLoginFlow(Math.min(flows.length - 1, login.selected + 1))
      return
    }
    if (matchesKey(data, Key.enter)) {
      this.actions.beginAuthorization(flows[login.selected]!.key)
    }
  }
}
