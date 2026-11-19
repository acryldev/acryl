/**
 * Share a plugin, in plain words: four places it can go (this computer, my GitHub privately, my GitHub publicly, the public registry), one question before
 * anything is sent with Cancel as the default, and a short answer after. Git, repositories, licenses and topics are behind a "Details" toggle.
 * It owns only what the person is looking at; the sharing itself is `plugin.share`, the packed copy `plugin.actions.save`, both from the Host.
 */

import { useEffect, useState } from 'react'
import type { GithubConnectState, GithubReadiness, SavedPluginResult, SharedPluginView, SharePlan } from '../contract.ts'
import { colleagueAddress, shareButton, shareDetails, shareQuestion, type NavigatorPlugin, type ShareTarget } from './plugins-navigator.ts'
import { PlainFailure } from './plain-failure.ts'
import type { GithubConnectApi } from './registry-api.ts'

export interface ShareChooserProps {
  readonly plugin: NavigatorPlugin
  /** Whether this computer can share to GitHub; read once when the chooser opens. */
  readonly readGithub: () => Promise<GithubReadiness>
  /** Connect GitHub from here (GitHub's browser sign-in); without it the note shows the Terminal command only. */
  readonly connectGithub?: GithubConnectApi
  /** Copy a text; false when the browser refuses. */
  readonly copy: (text: string) => Promise<boolean>
  readonly onSaved: (saved: SavedPluginResult) => void
  readonly onShared: (shared: SharedPluginView) => void
  readonly onClose: () => void
}

type Step =
  | { readonly step: 'choose' }
  | { readonly step: 'working'; readonly what: string }
  | { readonly step: 'confirm'; readonly plan: SharePlan }
  | { readonly step: 'done'; readonly text: string; readonly address?: string }
  | { readonly step: 'failed'; readonly say: string; readonly details?: string }

type Github = GithubReadiness | { readonly status: 'checking' }

const failed = (cause: unknown): Step => cause instanceof PlainFailure
  ? { step: 'failed', say: cause.message, ...(cause.details === undefined ? {} : { details: cause.details }) }
  : { step: 'failed', say: 'Something went wrong, and nothing was sent.', details: cause instanceof Error ? cause.message : String(cause) }

const SAVED = (saved: SavedPluginResult): string => saved.bumped
  ? `Saved on this computer as v${saved.version}. An older v${saved.version} was already saved with different content, so this one got the next number.`
  : saved.added ? `Saved on this computer as v${saved.version}. Nothing was sent anywhere.` : `This is already saved on this computer (v${saved.version}). Nothing changed.`

export function ShareChooser({ plugin, readGithub, connectGithub, copy, onSaved, onShared, onClose }: ShareChooserProps) {
  const [state, setState] = useState<Step>({ step: 'choose' })
  const [github, setGithub] = useState<Github>({ status: 'checking' })
  const [details, setDetails] = useState(false)
  const [copied, setCopied] = useState<string | undefined>(undefined)

  useEffect(() => {
    let live = true
    readGithub().then(
      (answer) => { if (live) setGithub(answer) },
      () => { if (live) setGithub({ status: 'unavailable', say: 'GitHub did not answer. Check your internet connection and try again.' }) },
    )
    return () => { live = false }
  }, [readGithub])

  const share = plugin.share
  const blocked = github.status === 'missing' || github.status === 'signed-out'
  const idle = state.step === 'choose' || state.step === 'failed' || state.step === 'done'

  const save = async () => {
    if (plugin.actions?.save === undefined) return
    setState({ step: 'working', what: 'Saving…' })
    try {
      const saved = await plugin.actions.save()
      onSaved(saved)
      setState({ step: 'done', text: SAVED(saved) })
    } catch (cause) {
      setState(failed(cause))
    }
  }

  const ask = async (target: ShareTarget) => {
    if (share === undefined) return
    setDetails(false)
    setState({ step: 'working', what: 'Checking…' })
    try {
      setState({ step: 'confirm', plan: await share.plan(target) })
    } catch (cause) {
      setState(failed(cause))
    }
  }

  const send = async (plan: SharePlan) => {
    if (share === undefined) return
    setState({ step: 'working', what: 'Sharing…' })
    try {
      const shared = await share.publish(plan)
      onShared(shared)
      const address = colleagueAddress(shared)
      setState({
        step: 'done',
        text: plan.registry === true
          ? `Done. ${plugin.name} is shared. The registry lists new plugins within about an hour, then anyone can find it there.`
          : plan.visibility === 'public' ? `Done. ${plugin.name} is shared with everyone.` : `Done. ${plugin.name} is shared with your team.`,
        ...(address === undefined ? {} : { address }),
      })
    } catch (cause) {
      setState(failed(cause))
    }
  }

  const copyAddress = async (address: string) => {
    setCopied((await copy(address)) ? 'Copied. Send it to a colleague: they paste it into Registry, "Add by address".' : `Your browser did not allow copying. Select it here: ${address}`)
  }

  const choices: readonly { readonly title: string; readonly say: string; readonly button: string; readonly target?: ShareTarget; readonly disabled: boolean }[] = [
    { title: 'This computer', say: 'Keep a copy here. Only you can see it. Nothing is sent anywhere.', button: 'Save here', disabled: plugin.actions?.save === undefined },
    { title: 'My GitHub, private', say: 'Share with your team. Only people you invite on GitHub can add it.', button: 'Share privately', target: 'private', disabled: share === undefined || blocked },
    { title: 'My GitHub, public', say: 'Anyone with the link can add it to their app.', button: 'Share publicly', target: 'public', disabled: share === undefined || blocked },
    { title: 'Public registry', say: 'List it for everyone to search and add with one click. Public.', button: 'List in the registry', target: 'registry', disabled: share === undefined || blocked },
  ]

  return (
    <div className="acrylBlendsShareChooser" role="group" aria-label={`Share ${plugin.name}`}>
      <p className="acrylBlendsShareHead">Where should {plugin.name} go?</p>
      {state.step === 'confirm'
        ? (
          <div className="acrylBlendsShareAsk" role="alertdialog" aria-label={`Confirm sharing ${plugin.name}`}>
            <p>{shareQuestion(state.plan)}</p>
            <div className="acrylBlendsShareRow">
              {/* Cancel is the default: Enter or a stray click sends nothing. */}
              <button type="button" className="acrylBlendsShareCancel" autoFocus onClick={() => { setState({ step: 'choose' }) }}>Cancel</button>
              <button type="button" className="acrylBlendsShareConfirm" onClick={() => { void send(state.plan) }}>{shareButton(state.plan)}</button>
              <button type="button" className="acrylBlendsShareButton" aria-expanded={details} onClick={() => { setDetails(open => !open) }}>Details</button>
            </div>
            {details && <ul className="acrylBlendsShareDetails">{shareDetails(state.plan).map(line => <li key={line}>{line}</li>)}</ul>}
          </div>
        )
        : (
          <ul>
            {choices.map(choice => (
              <li key={choice.title}>
                <span><b>{choice.title}</b>{choice.say}</span>
                <button type="button" disabled={choice.disabled || !idle} onClick={() => { void (choice.target === undefined ? save() : ask(choice.target)) }}>{choice.button}</button>
              </li>
            ))}
          </ul>
        )}
      {state.step === 'confirm' || state.step === 'working' ? null : (
        <GithubNote github={github} copy={copy} connect={connectGithub} onConnected={() => { void readGithub().then(setGithub, () => {}) }} />
      )}
      {state.step === 'working' && <p className="acrylBlendsNote" role="status">{state.what}</p>}
      {state.step === 'done' && (
        <p className="acrylBlendsPlugSaid" role="status">
          {state.text}
          {state.address !== undefined && (
            <>
              {' '}
              <button type="button" className="acrylBlendsShareButton" onClick={() => { void copyAddress(state.address ?? '') }}>Copy address to send to a colleague</button>
            </>
          )}
        </p>
      )}
      {copied !== undefined && <p className="acrylBlendsPlugSaid" role="status">{copied}</p>}
      {state.step === 'failed' && (
        <p className="acrylBlendsNote" data-error role="alert">
          {state.say}
          {state.details !== undefined && (
            <>
              {' '}
              <button type="button" className="acrylBlendsShareButton" aria-expanded={details} onClick={() => { setDetails(open => !open) }}>Details</button>
            </>
          )}
        </p>
      )}
      {state.step === 'failed' && details && state.details !== undefined && <pre className="acrylBlendsDetailsText">{state.details}</pre>}
      {state.step !== 'confirm' && <button type="button" className="acrylBlendsShareCancel" onClick={onClose}>Close</button>}
    </div>
  )
}

/** How often the page asks whether the person finished on github.com. */
const CONNECT_POLL_MS = 2_000

/** Why the three GitHub choices are greyed out, and the one thing to do about it: Connect GitHub (or, without it, the Terminal command). */
function GithubNote({ github, copy, connect, onConnected }: {
  readonly github: Github
  readonly copy: (text: string) => Promise<boolean>
  readonly connect: GithubConnectApi | undefined
  readonly onConnected: () => void
}) {
  const [copied, setCopied] = useState<string | undefined>(undefined)
  const [connecting, setConnecting] = useState<GithubConnectState>({ status: 'idle' })
  const waiting = connecting.status === 'starting' || connecting.status === 'code'

  useEffect(() => {
    if (connect === undefined || !waiting) return
    let live = true
    const timer = setInterval(() => {
      connect.state().then(
        (now) => {
          if (!live) return
          setConnecting(now)
          if (now.status === 'connected') onConnected()
        },
        () => {},
      )
    }, CONNECT_POLL_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [connect, waiting, onConnected])

  if (github.status === 'checking' || github.status === 'ready') return null
  const start = (): void => {
    if (connect === undefined) return
    setConnecting({ status: 'starting' })
    connect.start().then(setConnecting, (cause: unknown) => {
      setConnecting({ status: 'failed', say: cause instanceof PlainFailure ? cause.message : 'GitHub could not be reached. Check your internet connection and try again.' })
    })
  }
  const copyText = (text: string, said: string): void => {
    void copy(text).then(ok => { setCopied(ok ? said : undefined) })
  }
  return (
    <div className="acrylBlendsNote acrylBlendsConnect" role="status" data-warn={connecting.status === 'code' ? undefined : ''}>
      {connecting.status === 'code' ? (
        <>
          <p>Enter this code on GitHub, then press Authorize. This window updates by itself.</p>
          <p className="acrylBlendsConnectCode">
            <code aria-label="One-time code">{connecting.code}</code>
            <button type="button" className="acrylBlendsShareButton" onClick={() => { copyText(connecting.code, 'code') }}>{copied === 'code' ? 'Copied' : 'Copy code'}</button>
            <a className="acrylBlendsConnectOpen" href={connecting.url} target="_blank" rel="noreferrer">Open GitHub</a>
          </p>
        </>
      ) : connecting.status === 'connected' ? (
        <p>GitHub is connected. Checking your account...</p>
      ) : (
        <>
          <p>{connecting.status === 'failed' ? connecting.say : github.say}</p>
          {github.status === 'signed-out' && connect !== undefined && (
            <p>
              <button type="button" className="acrylBlendsConnectButton" disabled={connecting.status === 'starting'} onClick={start}>
                {connecting.status === 'starting' ? 'Connecting...' : 'Connect GitHub'}
              </button>
            </p>
          )}
          {github.status === 'signed-out' && (
            <p className="acrylBlendsConnectAlt">
              {connect === undefined ? 'Open the Terminal and run:' : 'Or in the Terminal:'}{' '}
              <code>{github.command}</code>{' '}
              <button type="button" className="acrylBlendsShareButton" onClick={() => { copyText(github.command, 'command') }}>{copied === 'command' ? 'Copied' : 'Copy'}</button>
            </p>
          )}
          {github.status === 'missing' && (
            <p><a className="acrylBlendsShared" href={github.link} target="_blank" rel="noreferrer">cli.github.com</a></p>
          )}
        </>
      )}
    </div>
  )
}
