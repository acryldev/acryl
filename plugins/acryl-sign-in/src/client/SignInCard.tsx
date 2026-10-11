/**
 * Settings > Models: sign in to a model provider with an account. Claude, ChatGPT (OpenAI Codex), DeepSeek and every
 * other provider whose harness flow offers OAuth run through the Host's sign-in routes. API keys stay on the page's own
 * provider editor above.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { SignInAttemptView } from 'acryl-control'
import type { InjectFace, PropsLocale, PropsRuntime } from '@acryl/ui/frame'
import type { SignInProviderView } from '../contract.ts'
import type { SignInApi } from './sign-in-api.ts'

export interface SignInCardInjected {
  readonly api: SignInApi
  /** Opens a sign-in page outside the app (the system browser on Desktop, a new tab on Web). */
  readonly openExternal: (url: string) => void
  readonly copy: (text: string) => Promise<void>
  /** The UI's language (BCP 47), for a provider page that is localized. */
  readonly language: () => string | undefined
}

export type SignInCardProps =
  PropsRuntime<'settings.models.footer'>
  & PropsLocale<'acryl.sign-in'>
  & InjectFace<SignInCardInjected>

/**
 * Flow providers named first, with the names people know them by; the rest go under "Other providers". ChatGPT is the
 * `openai` route since pi-ai 1.x ("Sign in with ChatGPT"); `openai-codex` is its legacy route and stays in the list.
 */
const FEATURED = [
  { key: 'llm-pi-ai/anthropic', name: 'claude', via: 'claudeVia' },
  { key: 'llm-pi-ai/openai', name: 'chatgpt', via: 'chatgptVia' },
  { key: 'deepseek-account-platform/default', name: 'deepseek', via: 'deepseekVia' },
] as const

const POLL_MS = 700

type Providers =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly list: readonly SignInProviderView[] }
  | { readonly status: 'error'; readonly message: string }

type Active =
  | { readonly kind: 'none' }
  | { readonly kind: 'flow'; readonly key: string; readonly attempt: SignInAttemptView | undefined; readonly error?: string }

const message = (cause: unknown): string => cause instanceof Error ? cause.message : String(cause)
const oauthOf = (provider: SignInProviderView): string | undefined => provider.methods.find(method => method.id === 'oauth')?.id

export function SignInCard({ api, openExternal, copy, language, t }: SignInCardProps) {
  const [providers, setProviders] = useState<Providers>({ status: 'loading' })
  const [active, setActive] = useState<Active>({ kind: 'none' })
  const [other, setOther] = useState('')
  const [notice, setNotice] = useState('')
  const opened = useRef(new Set<string>())

  const load = useCallback(() => {
    api.providers().then(
      response => { setProviders({ status: 'ready', list: response.providers.filter(provider => oauthOf(provider) !== undefined) }) },
      (cause: unknown) => { setProviders({ status: 'error', message: message(cause) }) },
    )
  }, [api])

  useEffect(() => {
    load()
    // Pick up a conversation that was already running (the page was reopened while the browser step was pending).
    api.attempt().then(attempt => {
      if (attempt !== null && attempt.phase === 'running') setActive({ kind: 'flow', key: attempt.key, attempt })
    }, () => {})
  }, [api, load])

  const running = active.kind === 'flow' && active.attempt?.phase === 'running'
  const attemptId = active.kind === 'flow' ? active.attempt?.id : undefined
  useEffect(() => {
    if (!running || attemptId === undefined) return
    const timer = setInterval(() => {
      api.attempt().then(attempt => {
        if (attempt === null || attempt.id !== attemptId) return
        setActive(current => current.kind === 'flow' && current.attempt?.id === attemptId ? { ...current, attempt } : current)
        if (attempt.phase === 'authorized') { setNotice(t('done')); load() }
      }, () => {})
    }, POLL_MS)
    return () => { clearInterval(timer) }
  }, [api, running, attemptId, load, t])

  // A sign-in page opens once per attempt; the link stays on the card for a blocked pop-up or a closed tab.
  const url = active.kind === 'flow' ? [...active.attempt?.notices ?? []].reverse().find(item => item.url !== undefined)?.url : undefined
  useEffect(() => {
    if (url === undefined || attemptId === undefined) return
    const id = `${attemptId} ${url}`
    if (opened.current.has(id)) return
    opened.current.add(id)
    openExternal(url)
  }, [url, attemptId, openExternal])

  const begin = (key: string, method: string | undefined): void => {
    setNotice('')
    setActive({ kind: 'flow', key, attempt: undefined })
    api.begin(key, method, language()).then(
      attempt => { setActive({ kind: 'flow', key, attempt }) },
      (cause: unknown) => { setActive({ kind: 'flow', key, attempt: undefined, error: message(cause) }) },
    )
  }
  const cancel = (): void => {
    if (active.kind === 'flow' && active.attempt?.phase === 'running') api.cancel(active.attempt.id).catch(() => {})
    setActive({ kind: 'none' })
  }

  const row = (provider: SignInProviderView, name: string, via: string) => (
    <div key={provider.key}>
      <div className="acrylSignInRow">
        <div className="acrylSignInName"><strong>{name}</strong><span>{via}</span></div>
        {provider.configured && <span className="acrylSignInState">{t('signedIn')}</span>}
        <button type="button" className="acrylSignInButton" disabled={running}
          onClick={() => { begin(provider.key, oauthOf(provider)) }}>
          {provider.configured ? t('signInAgain') : t('signIn')}
        </button>
      </div>
      {active.kind === 'flow' && active.key === provider.key && flow(active)}
    </div>
  )

  const flow = (current: Extract<Active, { kind: 'flow' }>) => {
    const attempt = current.attempt
    if (current.error !== undefined || attempt?.phase === 'failed') {
      return (
        <div className="acrylSignInFlow" role="alert">
          <p className="acrylSignInFlowTitle">{t('failed')}</p>
          <span className="acrylSignInNote" data-error="">{current.error ?? attempt?.error}</span>
          <div className="acrylSignInActions">
            <button type="button" className="acrylSignInButton" data-primary="" onClick={() => { begin(current.key, attempt?.method ?? undefined) }}>{t('tryAgain')}</button>
            <button type="button" className="acrylSignInButton" onClick={() => { setActive({ kind: 'none' }) }}>{t('cancel')}</button>
          </div>
        </div>
      )
    }
    if (attempt === undefined || attempt.phase !== 'running') return null
    return (
      <div className="acrylSignInFlow" aria-live="polite">
        {url !== undefined ? <>
          <p className="acrylSignInFlowTitle">{t('browserTitle')}</p>
          <span className="acrylSignInNote">{t('browserText')}</span>
          <div className="acrylSignInActions">
            <button type="button" className="acrylSignInButton" onClick={() => { openExternal(url) }}>{t('openPage')}</button>
            <button type="button" className="acrylSignInButton" onClick={() => { copy(url).then(() => { setNotice(t('copied')) }, () => {}) }}>{t('copyLink')}</button>
          </div>
        </> : attempt.prompt === undefined && <span className="acrylSignInNote">{attempt.notices.at(-1)?.message ?? t('working')}</span>}
        {attempt.prompt !== undefined && <Prompt key={attempt.prompt.id} attempt={attempt} api={api} t={t} />}
        <div className="acrylSignInActions">
          <button type="button" className="acrylSignInButton" onClick={cancel}>{t('cancel')}</button>
        </div>
      </div>
    )
  }

  const list = providers.status === 'ready' ? providers.list : []
  const featured = FEATURED.flatMap(item => {
    const provider = list.find(candidate => candidate.key === item.key)
    return provider === undefined ? [] : [{ provider, name: t(item.name), via: t(item.via) }]
  })
  const others = list.filter(provider => !FEATURED.some(item => item.key === provider.key))
  const chosen = others.find(provider => provider.key === other)

  return (
    <section className="acrylSignIn" aria-label={t('heading')}>
      <h3 className="acrylSignInHeading">{t('heading')}</h3>
      <p className="acrylSignInText">{t('description')}</p>
      {featured.map(item => row(item.provider, item.name, item.via))}
      {others.length > 0 && <>
        <div className="acrylSignInRow">
          <select className="acrylSignInSelect" aria-label={t('otherProviders')} value={other} onChange={event => { setOther(event.target.value) }}>
            <option value="">{t('otherProviders')}: {t('otherPlaceholder')}</option>
            {others.map(provider => <option key={provider.key} value={provider.key}>{provider.label}{provider.configured ? ` (${t('signedIn')})` : ''}</option>)}
          </select>
          <button type="button" className="acrylSignInButton" disabled={chosen === undefined || running}
            onClick={() => { if (chosen !== undefined) begin(chosen.key, oauthOf(chosen)) }}>{t('signIn')}</button>
        </div>
        {active.kind === 'flow' && chosen !== undefined && active.key === chosen.key && flow(active)}
      </>}
      {providers.status === 'error' && <span className="acrylSignInNote" data-error="">{t('unavailable')}</span>}
      {notice !== '' && <span className="acrylSignInNote" role="status">{notice}</span>}
    </section>
  )
}

/** The question the flow waits on: a typed code or a pasted redirect URL, a secret, or a choice. */
function Prompt({ attempt, api, t }: { readonly attempt: SignInAttemptView; readonly api: SignInApi; readonly t: SignInCardProps['t'] }) {
  const prompt = attempt.prompt
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  if (prompt === undefined) return null
  const send = (answer: string): void => {
    setError('')
    api.answer(attempt.id, prompt.id, answer).catch((cause: unknown) => { setError(message(cause)) })
  }
  const title = prompt.message.replace(/:\s*$/u, '')
  if (prompt.kind === 'select') {
    return (
      <div className="acrylSignInOptions">
        <span className="acrylSignInNote">{title}</span>
        {(prompt.options ?? []).map(option => (
          <button key={option.id} type="button" className="acrylSignInButton" onClick={() => { send(option.id) }}>{option.label}</button>
        ))}
        {error !== '' && <span className="acrylSignInNote" data-error="">{error}</span>}
      </div>
    )
  }
  return (
    <form className="acrylSignInOptions" onSubmit={event => { event.preventDefault(); if (value.trim() !== '') send(value.trim()) }}>
      <span className="acrylSignInNote">{title}</span>
      <div className="acrylSignInActions">
        <input className="acrylSignInInput" aria-label={title} type={prompt.kind === 'secret' ? 'password' : 'text'} autoComplete="off"
          placeholder={prompt.placeholder ?? ''} value={value} onChange={event => { setValue(event.target.value) }} />
        <button type="submit" className="acrylSignInButton" data-primary="" disabled={value.trim() === ''}>{t('continue')}</button>
      </div>
      {error !== '' && <span className="acrylSignInNote" data-error="">{error}</span>}
    </form>
  )
}
