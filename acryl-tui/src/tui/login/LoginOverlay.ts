/**
 * `/login` overlay: the list of `ctx.authorization` sign-in flows (Anthropic,
 * OpenAI Codex, GitHub Copilot, …) registered by `dsh-llm-pi-ai`. Selecting one
 * and pressing enter runs its flow through `ctx.authorization.begin`, which
 * drives pi-ai's own OAuth strategies and persists the grant.
 * @module @tomowang/dsh-tui/tui/login/LoginOverlay
 */

import type { Component } from '@earendil-works/pi-tui'
import { Key, matchesKey } from '@earendil-works/pi-tui'
import type { TuiActions } from '../actions.js'
import type { TuiStore } from '../store.js'
import type { LoginOverlayState } from './types.js'
import { theme, fg } from '../theme.js'

const bold = (s: string): string => `\x1b[1m${s}\x1b[0m`
const secondary = fg(theme.secondary)
const muted = fg(theme.muted)
const errorColor = fg(theme.error)
const invert = (s: string): string => `\x1b[7m${s}\x1b[0m`

export class LoginOverlay implements Component {
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

  render(_width: number): string[] {
    const overlay = this.store.getSnapshot().overlay
    if (overlay.kind !== 'login') return []
    return this.renderList(overlay.login)
  }

  handleInput(data: string): void {
    const overlay = this.store.getSnapshot().overlay
    if (overlay.kind !== 'login') return
    const login = overlay.login
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
