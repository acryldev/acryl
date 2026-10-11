/**
 * `SignInAttempts`: the one sign-in conversation a surface shows at a time, as a plain read model.
 *
 * `AuthorizationService.begin` runs a flow to its end and talks to the human through callbacks (notices, prompts). A
 * request/response surface (a native window, a page) cannot hold a callback open, so this owns the conversation in
 * between: it starts the flow, records what the flow said (`notices`) and asked (`prompt`), lets the surface answer or
 * cancel by id, and reports how it ended. The terminal keeps its own copy of this logic inline; this is the shared one.
 *
 * Framework-free: the only dependency is a `begin` function, so it is unit-testable without Cordis. A secret typed into a
 * prompt travels from `answer` to the flow and is never stored here.
 */
import type { AuthorizationBeginRequest, AuthorizationOutcome } from './types.ts'

/** What the running flow said: where to go, or what to do next. */
export interface SignInNotice {
  readonly message: string
  readonly url?: string
  readonly code?: string
}

/** A question the running flow waits on. */
export interface SignInPrompt {
  /** Echoed back by `answer`, so a late answer to a withdrawn question is refused. */
  readonly id: string
  readonly kind: 'text' | 'secret' | 'select'
  readonly message: string
  readonly placeholder?: string
  readonly options?: readonly { readonly id: string; readonly label: string; readonly description?: string }[]
}

export type SignInPhase = 'running' | 'authorized' | 'cancelled' | 'failed'

/** One attempt as a surface sees it. */
export interface SignInAttemptView {
  readonly id: string
  readonly key: string
  readonly method: string | undefined
  readonly phase: SignInPhase
  /** The most recent notices, oldest first. */
  readonly notices: readonly SignInNotice[]
  /** The question the flow is waiting on, while `phase` is `running`. */
  readonly prompt?: SignInPrompt
  /** Why a `failed` attempt failed, in words safe to show. */
  readonly error?: string
}

export interface SignInAttemptsDeps {
  readonly begin: (request: AuthorizationBeginRequest) => Promise<AuthorizationOutcome>
  /** A fresh id for an attempt or a prompt. */
  readonly newId: () => string
}

/** A refused request (unknown attempt, stale prompt): the caller learns what to fix. */
export class SignInAttemptError extends Error {
  constructor(readonly code: 'unknown-attempt' | 'unknown-prompt' | 'invalid-answer', message: string) {
    super(message)
    this.name = 'SignInAttemptError'
  }
}

const MAX_NOTICES = 8

interface Live {
  view: SignInAttemptView
  readonly controller: AbortController
  pending: { readonly prompt: SignInPrompt; readonly resolve: (value: string) => void; readonly reject: (cause: Error) => void } | undefined
}

/**
 * A flow's failure as a person reads it. Provider token endpoints answer with a JSON body that the flows quote whole
 * ("... token exchange failed (401): { "error": { "message": "Could not validate your token. ..." } }"); keep the flow's
 * own lead-in and the provider's sentence, drop the JSON around it.
 */
export function readableFailure(cause: unknown): string {
  const message = cause instanceof Error ? cause.message.trim() : ''
  if (message === '') return 'Sign-in failed.'
  const start = message.indexOf('{')
  if (start === -1) return message
  let body: unknown
  try {
    body = JSON.parse(message.slice(start))
  } catch {
    return message
  }
  const record = (value: unknown): Record<string, unknown> | undefined => typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined
  const nested = record(record(body)?.error)
  const said = [nested?.message, record(body)?.error_description, record(body)?.message, record(body)?.error].find(value => typeof value === 'string' && value.trim() !== '')
  if (typeof said !== 'string') return message
  const lead = message.slice(0, start).trim().replace(/:$/u, '')
  return lead === '' ? said.trim() : `${lead}: ${said.trim()}`
}

export class SignInAttempts {
  private live: Live | undefined

  constructor(private readonly deps: SignInAttemptsDeps) {}

  /** The latest attempt (running or settled), or undefined before any. */
  current(): SignInAttemptView | undefined {
    return this.live?.view
  }

  /**
   * Start an attempt, withdrawing a running one first (a surface that restarts has abandoned the old conversation).
   * @returns the new attempt, already `running`.
   */
  begin(key: string, method: string | undefined): SignInAttemptView {
    if (this.live?.view.phase === 'running') this.withdraw(this.live)
    const live: Live = {
      view: { id: this.deps.newId(), key, method, phase: 'running', notices: [] },
      controller: new AbortController(),
      pending: undefined,
    }
    this.live = live
    void this.run(live)
    return live.view
  }

  /**
   * Answer the question the flow is waiting on.
   * @param promptId - the id of the prompt being answered, as the view showed it.
   * @param value - the typed text or the chosen option id.
   */
  answer(attemptId: string, promptId: string, value: string): SignInAttemptView {
    const live = this.require(attemptId)
    const pending = live.pending
    if (pending === undefined || pending.prompt.id !== promptId) throw new SignInAttemptError('unknown-prompt', 'That question is no longer being asked.')
    if (pending.prompt.kind === 'select' && !(pending.prompt.options ?? []).some(option => option.id === value)) {
      throw new SignInAttemptError('invalid-answer', 'That is not one of the choices.')
    }
    live.pending = undefined
    this.show(live, undefined)
    pending.resolve(value)
    return live.view
  }

  /** Withdraw the attempt; a settled attempt is left as it ended. */
  cancel(attemptId: string): SignInAttemptView {
    const live = this.require(attemptId)
    if (live.view.phase === 'running') this.withdraw(live)
    return live.view
  }

  private require(attemptId: string): Live {
    if (this.live === undefined || this.live.view.id !== attemptId) throw new SignInAttemptError('unknown-attempt', 'That sign-in is no longer current.')
    return this.live
  }

  private update(live: Live, patch: { readonly phase?: SignInPhase; readonly notices?: readonly SignInNotice[]; readonly error?: string }): void {
    live.view = { ...live.view, ...patch }
  }

  /** Show (or clear) the question the flow waits on. */
  private show(live: Live, prompt: SignInPrompt | undefined): void {
    const { prompt: _previous, ...rest } = live.view
    live.view = prompt === undefined ? rest : { ...rest, prompt }
  }

  /** Stop a running attempt: the flow's pending question is refused, which ends it as cancelled. */
  private withdraw(live: Live): void {
    live.controller.abort()
    live.pending?.reject(new Error('sign-in withdrawn'))
    live.pending = undefined
    this.show(live, undefined)
    this.update(live, { phase: 'cancelled' })
  }

  private async run(live: Live): Promise<void> {
    const interaction: AuthorizationBeginRequest['interaction'] = {
      notify: notice => {
        this.update(live, { notices: [...live.view.notices, notice].slice(-MAX_NOTICES) })
      },
      prompt: prompt => new Promise<string>((resolve, reject) => {
        if (live.controller.signal.aborted || prompt.signal?.aborted === true) { reject(new Error('sign-in withdrawn')); return }
        const shown: SignInPrompt = {
          id: this.deps.newId(),
          kind: prompt.kind,
          message: prompt.message,
          ...prompt.placeholder === undefined ? {} : { placeholder: prompt.placeholder },
          ...prompt.options === undefined ? {} : { options: prompt.options.map(option => ({ id: option.id, label: option.label, ...option.description === undefined ? {} : { description: option.description } })) },
        }
        live.pending = { prompt: shown, resolve, reject }
        this.show(live, shown)
        // A flow that races a typed code against a browser callback withdraws the losing question itself.
        prompt.signal?.addEventListener('abort', () => {
          if (live.pending?.prompt.id !== shown.id) return
          live.pending = undefined
          this.show(live, undefined)
          reject(new Error('sign-in question withdrawn'))
        }, { once: true })
      }),
    }
    try {
      const outcome = await this.deps.begin({ key: live.view.key, method: live.view.method, interaction, signal: live.controller.signal })
      // A cancel that raced the end of the flow wins: the surface already showed the attempt as cancelled.
      if (live.view.phase !== 'running') return
      this.show(live, undefined)
      this.update(live, { phase: outcome.status === 'authorized' ? 'authorized' : 'cancelled' })
    } catch (cause) {
      if (live.view.phase !== 'running') return
      this.show(live, undefined)
      this.update(live, { phase: 'failed', error: readableFailure(cause) })
    }
  }
}
