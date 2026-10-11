import { describe, expect, it } from 'vitest'
import { SignInAttemptError, SignInAttempts, readableFailure } from '../src/authorization/attempts.ts'
import type { AuthorizationBeginRequest, AuthorizationOutcome } from '../src/authorization/types.ts'

/** A flow the test drives by hand: `begin` stays open until the test settles it. */
function harness() {
  let ids = 0
  const requests: AuthorizationBeginRequest[] = []
  let settle: (result: AuthorizationOutcome | Error) => void = () => {}
  const attempts = new SignInAttempts({
    newId: () => `id-${String(++ids)}`,
    begin: request => {
      requests.push(request)
      return new Promise<AuthorizationOutcome>((resolve, reject) => {
        settle = result => { if (result instanceof Error) reject(result); else resolve(result) }
        request.signal?.addEventListener('abort', () => { settle({ status: 'cancelled' }) }, { once: true })
      })
    },
  })
  return { attempts, requests, settle: (result: AuthorizationOutcome | Error) => { settle(result) } }
}

const tick = () => new Promise<void>(resolve => { setTimeout(resolve, 0) })

describe('SignInAttempts', () => {
  it('has no current attempt before one starts', () => {
    expect(harness().attempts.current()).toBeUndefined()
  })

  it('starts running and passes the key and method to the flow', () => {
    const { attempts, requests } = harness()
    const view = attempts.begin('llm-pi-ai/anthropic', 'oauth')
    expect(view).toMatchObject({ id: 'id-1', key: 'llm-pi-ai/anthropic', method: 'oauth', phase: 'running', notices: [] })
    expect(requests[0]).toMatchObject({ key: 'llm-pi-ai/anthropic', method: 'oauth' })
  })

  it('records what the flow said, keeping the most recent notices', () => {
    const { attempts, requests } = harness()
    attempts.begin('k', undefined)
    const interaction = requests[0]!.interaction
    for (let n = 1; n <= 10; n++) interaction.notify({ message: `step ${String(n)}`, ...n === 10 ? { url: 'https://example.test/auth', code: 'ABCD' } : {} })
    const notices = attempts.current()!.notices
    expect(notices).toHaveLength(8)
    expect(notices.at(0)?.message).toBe('step 3')
    expect(notices.at(-1)).toEqual({ message: 'step 10', url: 'https://example.test/auth', code: 'ABCD' })
  })

  it('shows a question and hands the answer to the flow without keeping it', async () => {
    const { attempts, requests, settle } = harness()
    const started = attempts.begin('k', 'api-key')
    const answered = requests[0]!.interaction.prompt({ kind: 'secret', message: 'API key', placeholder: 'sk-...' })
    const prompt = attempts.current()!.prompt!
    expect(prompt).toMatchObject({ kind: 'secret', message: 'API key', placeholder: 'sk-...' })
    const afterAnswer = attempts.answer(started.id, prompt.id, 'sk-secret-value')
    expect(afterAnswer.prompt).toBeUndefined()
    expect(await answered).toBe('sk-secret-value')
    expect(JSON.stringify(attempts.current())).not.toContain('sk-secret-value')
    settle({ status: 'authorized' })
    await tick()
    expect(attempts.current()!.phase).toBe('authorized')
  })

  it('refuses an answer for a stale question and a choice that was not offered', () => {
    const { attempts, requests } = harness()
    const view = attempts.begin('k', undefined)
    void requests[0]!.interaction.prompt({ kind: 'select', message: 'Account', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] })
    const prompt = attempts.current()!.prompt!
    expect(() => attempts.answer(view.id, 'other', 'a')).toThrow(SignInAttemptError)
    expect(() => attempts.answer(view.id, prompt.id, 'c')).toThrow('not one of the choices')
    expect(attempts.answer(view.id, prompt.id, 'b').prompt).toBeUndefined()
  })

  it('refuses a request about an attempt that is not current', () => {
    const { attempts } = harness()
    attempts.begin('k', undefined)
    expect(() => attempts.cancel('nope')).toThrow(SignInAttemptError)
    expect(() => attempts.answer('nope', 'p', 'x')).toThrow(SignInAttemptError)
  })

  it('cancels a running attempt: the flow is withdrawn and a waiting question is refused', async () => {
    const { attempts, requests } = harness()
    const view = attempts.begin('k', undefined)
    const answered = requests[0]!.interaction.prompt({ kind: 'text', message: 'Code' })
    const caught = answered.catch((cause: unknown) => cause)
    const cancelled = attempts.cancel(view.id)
    expect(cancelled).toMatchObject({ phase: 'cancelled' })
    expect(cancelled.prompt).toBeUndefined()
    expect(requests[0]!.signal?.aborted).toBe(true)
    expect(await caught).toBeInstanceOf(Error)
    await tick()
    expect(attempts.current()!.phase).toBe('cancelled')
  })

  it('leaves a settled attempt as it ended when cancelled afterwards', async () => {
    const { attempts, settle } = harness()
    const view = attempts.begin('k', undefined)
    settle({ status: 'authorized' })
    await tick()
    expect(attempts.cancel(view.id).phase).toBe('authorized')
  })

  it('reports a failed flow with its message', async () => {
    const { attempts, settle } = harness()
    attempts.begin('k', undefined)
    settle(new Error('The provider refused the login.'))
    await tick()
    expect(attempts.current()).toMatchObject({ phase: 'failed', error: 'The provider refused the login.' })
  })

  it('withdraws a running attempt when another one starts, and ignores the old one finishing late', async () => {
    const { attempts, requests, settle } = harness()
    const first = attempts.begin('one', undefined)
    const second = attempts.begin('two', undefined)
    expect(first.id).not.toBe(second.id)
    expect(requests[0]!.signal?.aborted).toBe(true)
    expect(attempts.current()).toMatchObject({ id: second.id, key: 'two', phase: 'running' })
    settle({ status: 'authorized' })
    await tick()
    expect(attempts.current()).toMatchObject({ id: second.id })
  })

  it('drops a question the flow withdraws itself', () => {
    const { attempts, requests } = harness()
    attempts.begin('k', undefined)
    const own = new AbortController()
    void requests[0]!.interaction.prompt({ kind: 'text', message: 'Paste the code', signal: own.signal }).catch(() => undefined)
    expect(attempts.current()!.prompt).toBeDefined()
    own.abort()
    expect(attempts.current()!.prompt).toBeUndefined()
    expect(attempts.current()!.phase).toBe('running')
  })
})

describe('readableFailure', () => {
  it('keeps the flow\'s lead-in and the provider\'s sentence from a quoted JSON error body', () => {
    const cause = new Error('OpenAI Codex token exchange failed (401): { "error": { "message": "Could not validate your token. Please try signing in again.", "type": "invalid_request_error", "param": null, "code": "token_expired" } }')
    expect(readableFailure(cause)).toBe('OpenAI Codex token exchange failed (401): Could not validate your token. Please try signing in again.')
  })

  it('reads an OAuth error_description', () => {
    expect(readableFailure(new Error('Token exchange failed: {"error":"invalid_grant","error_description":"Invalid code."}'))).toBe('Token exchange failed: Invalid code.')
  })

  it('leaves a plain message, an unparsable body and an empty failure readable', () => {
    expect(readableFailure(new Error('Network unreachable'))).toBe('Network unreachable')
    expect(readableFailure(new Error('Bad answer: {not json'))).toBe('Bad answer: {not json')
    expect(readableFailure(new Error(''))).toBe('Sign-in failed.')
    expect(readableFailure('string')).toBe('Sign-in failed.')
  })
})
