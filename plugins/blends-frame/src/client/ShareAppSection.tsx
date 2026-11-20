/**
 * Settings > Share, in every app (window or browser tab): send the whole app, as it is now, to a GitHub repository of the person's own. The plan
 * comes first (which repository, who can see it, what is saved first) and nothing leaves the computer until the person says yes. GitHub is
 * connected here the way the Plugins page connects it. Laid out as the App page is: a title, one line under it, one bordered row per thing.
 */

import { type FormEvent, useCallback, useEffect, useState } from 'react'
import {
  type AppStoreListingView,
  type AppSharedView,
  type AppSharePlanView,
  type AppShareRequest,
  FRAME_APP_SHARE_PATH,
  FRAME_APP_SHARE_PLAN_PATH,
  parseAppShared,
  parseAppSharePlan,
  STORE_CATEGORIES_URL,
} from '../contract.ts'
import { failureOf, PlainFailure } from './plain-failure.ts'
import type { RegistryApi } from './registry-api.ts'
import { type Github, GithubNote } from './ShareChooser.tsx'

export interface ShareAppApi {
  plan(request: AppShareRequest): Promise<AppSharePlanView>
  share(request: AppShareRequest, confirm: AppSharePlanView): Promise<AppSharedView>
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export function createShareAppApi(fetcher: FetchLike = (input, init) => fetch(input, init)): ShareAppApi {
  const post = async (path: string, body: unknown): Promise<unknown> => {
    const response = await fetcher(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw await failureOf(response)
    return response.json()
  }
  return {
    plan: async request => parseAppSharePlan(await post(FRAME_APP_SHARE_PLAN_PATH, request)),
    share: async (request, confirm) => parseAppShared(await post(FRAME_APP_SHARE_PATH, { ...request, confirm })),
  }
}

export interface ShareAppSectionInjected {
  readonly share: ShareAppApi
  /** Whether this computer can reach GitHub, and connecting it (the Plugins page's own). */
  readonly registry: Pick<RegistryApi, 'github' | 'connect'>
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

interface StoreCategory { readonly slug: string; readonly name: string; readonly subs: readonly { readonly slug: string; readonly name: string }[] }

/** The store's categories for the two selects; empty when the list cannot be read (the plan still names the place). */
async function storeCategories(): Promise<readonly StoreCategory[]> {
  try {
    const response = await fetch(STORE_CATEGORIES_URL)
    const list = response.ok ? ((await response.json()) as { categories?: unknown }).categories : undefined
    return Array.isArray(list) ? (list as StoreCategory[]) : []
  } catch {
    return []
  }
}

const LICENSES = ['MIT', 'Apache-2.0', 'BSD-3-Clause', 'GPL-3.0-or-later', 'MPL-2.0']

/** Where the store lists it, in words: `Application › Productivity`. */
function placeWords(listing: AppStoreListingView, categories: readonly StoreCategory[]): string {
  const category = categories.find(c => c.slug === listing.placement.category)
  const sub = category?.subs.find(s => s.slug === listing.placement.subcategory)
  return [category?.name ?? listing.placement.category, ...(listing.placement.subcategory === undefined ? [] : [sub?.name ?? listing.placement.subcategory])].join(' › ')
}

/** `github.com/ana/shop` from a remote address, for reading. */
const readable = (remote: string): string => remote.replace(/^git\+/u, '').replace(/^https?:\/\//u, '').replace(/\.git$/u, '')

type Step =
  | { readonly kind: 'ask' }
  | { readonly kind: 'busy' }
  | { readonly kind: 'plan'; readonly plan: AppSharePlanView }
  | { readonly kind: 'sending'; readonly plan: AppSharePlanView }
  | { readonly kind: 'shared'; readonly shared: AppSharedView }

export function ShareAppSection({ share, registry }: ShareAppSectionInjected) {
  const [github, setGithub] = useState<Github>({ status: 'checking' })
  const [owner, setOwner] = useState('')
  const [visibility, setVisibility] = useState<'private' | 'public'>('private')
  const [step, setStep] = useState<Step>({ kind: 'ask' })
  const [list, setList] = useState<AppShareRequest['list'] | undefined>(undefined)
  const [categories, setCategories] = useState<readonly StoreCategory[]>([])
  useEffect(() => { if (list !== undefined && categories.length === 0) void storeCategories().then(setCategories) }, [list, categories.length])
  const [failure, setFailure] = useState<string | undefined>(undefined)

  const readGithub = useCallback(() => {
    registry.github().then(setGithub, () => { setGithub({ status: 'checking' }) })
  }, [registry])
  useEffect(() => { readGithub() }, [readGithub])

  const listed = visibility === 'public' && list !== undefined
  const request: AppShareRequest = { ...(owner.trim() === '' ? {} : { owner: owner.trim() }), visibility, ...(listed ? { list } : {}) }
  const fail = (cause: unknown): void => {
    setFailure(cause instanceof PlainFailure || cause instanceof Error ? cause.message : String(cause))
  }
  const review = (event: FormEvent): void => {
    event.preventDefault()
    setFailure(undefined)
    setStep({ kind: 'busy' })
    share.plan(request).then(plan => { setStep({ kind: 'plan', plan }) }, (cause: unknown) => { setStep({ kind: 'ask' }); fail(cause) })
  }
  /** A new place or licence: the plan is read again, so the yes covers exactly what is shown. */
  const replace = (change: { readonly category?: string; readonly subcategory?: string | undefined; readonly license?: string }, current: AppStoreListingView): void => {
    const subcategory = 'subcategory' in change ? change.subcategory : current.placement.subcategory
    const next = { category: change.category ?? current.placement.category, ...(subcategory === undefined ? {} : { subcategory }), license: change.license ?? current.license }
    setList(next)
    setFailure(undefined)
    setStep({ kind: 'busy' })
    share.plan({ ...request, list: next }).then(plan => { setStep({ kind: 'plan', plan }) }, (cause: unknown) => { setStep({ kind: 'ask' }); fail(cause) })
  }
  const send = (plan: AppSharePlanView): void => {
    setFailure(undefined)
    setStep({ kind: 'sending', plan })
    share.share(request, plan).then(shared => { setStep({ kind: 'shared', shared }) }, (cause: unknown) => { setStep({ kind: 'plan', plan }); fail(cause) })
  }
  const ready = github.status === 'ready'

  return (
    <div className="acrylBlendsApp">
      <h3>Share</h3>
      <p className="acrylBlendsPluginsSub">Send this app, as it is now, to a GitHub repository of your own. Nothing is sent until you say yes.</p>
      <GithubNote github={github} copy={copyText} connect={registry.connect} onConnected={readGithub} />
      {failure !== undefined && <p className="acrylBlendsNote" data-error role="alert">{failure}</p>}

      {step.kind === 'shared' ? (
        <div className="acrylBlendsAppRow">
          <b>Shared</b>
          <small role="status">
            Sent to <span className="acrylBlendsMeta">{readable(step.shared.remote)}</span>{step.shared.created ? ' (a new repository)' : ''}. Every
            later version is saved there too. Someone you give access makes their own copy with{' '}
            <code>{`git clone ${step.shared.remote.replace(/^git\+/u, '')}`}</code>
          </small>
          {step.shared.listed !== undefined && (
            <small role="status">
              {step.shared.listed.created
                ? `Listed in the Blends store from ${step.shared.listed.tag}: acrylblends.github.io and Control Center show it within about an hour.`
                : `${step.shared.listed.tag} was already listed, so the store keeps that version. Raise the version in package.json to list this one.`}
            </small>
          )}
        </div>
      ) : step.kind === 'plan' || step.kind === 'sending' ? (
        <>
          <div className="acrylBlendsAppRow">
            <b>Repository</b>
            <small>{readable(step.plan.create ? `github.com/${step.plan.repository}` : step.plan.repository)}{step.plan.create ? ' (a new repository)' : ''}</small>
          </div>
          <div className="acrylBlendsAppRow">
            <b>Who can see it</b>
            <small>{step.plan.visibility === 'private' ? 'Only you and people you invite (private)' : 'Anyone (public)'}</small>
          </div>
          {step.plan.listing !== undefined && (() => {
            const listing = step.plan.listing
            const category = categories.find(c => c.slug === listing.placement.category)
            return (
              <div className="acrylBlendsAppRow" data-wide="">
                <b>Blends store</b>
                {categories.length > 0 && (
                  <span className="acrylBlendsAppControls">
                    <select className="acrylBlendsSearch" aria-label="Category" disabled={step.kind === 'sending'} value={listing.placement.category} onChange={(event) => { replace({ category: event.target.value, subcategory: undefined }, listing) }}>
                      {categories.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                    </select>
                    <select className="acrylBlendsSearch" aria-label="Subcategory" disabled={step.kind === 'sending'} value={listing.placement.subcategory ?? ''} onChange={(event) => { replace({ subcategory: event.target.value === '' ? undefined : event.target.value }, listing) }}>
                      <option value="">No subcategory</option>
                      {(category?.subs ?? []).map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
                    </select>
                    <select className="acrylBlendsSearch" aria-label="Licence" disabled={step.kind === 'sending'} value={listing.license} onChange={(event) => { replace({ license: event.target.value }, listing) }}>
                      {[...new Set([listing.license, ...LICENSES])].map(id => <option key={id} value={id}>{`Licence: ${id}`}</option>)}
                    </select>
                  </span>
                )}
                <small>
                  Listed as {listing.id} under {placeWords(listing, categories)}, marked Community with your name, licence {listing.license}. People start from {listing.tag}.
                </small>
              </div>
            )
          })()}
          <div className="acrylBlendsAppRow">
            <b>What is sent</b>
            <small>{step.plan.changes === 0 ? 'The versions saved so far' : `${String(step.plan.changes)} changed ${step.plan.changes === 1 ? 'file is' : 'files are'} saved first, then every saved version`}</small>
          </div>
          <div className="acrylBlendsAppRow">
            <b>Send it?</b>
            <span className="acrylBlendsAppControls">
              <button type="button" className="acrylBlendsAppButton" disabled={step.kind === 'sending'} onClick={() => { send(step.plan) }}>
                {step.kind === 'sending' ? 'Sending…' : 'Yes, share this app'}
              </button>
              <button type="button" className="acrylBlendsAppButton" disabled={step.kind === 'sending'} onClick={() => { setStep({ kind: 'ask' }) }}>Not yet</button>
            </span>
            <small>Nothing has been sent. It is sent only when you say yes.</small>
          </div>
        </>
      ) : (
        <form className="acrylBlendsAppRow" data-wide="" onSubmit={review}>
          <b>Share to GitHub</b>
          <span className="acrylBlendsAppControls">
            <input className="acrylBlendsSearch" aria-label="GitHub account" placeholder="GitHub account (blank: yours)" value={owner} onChange={(event) => { setOwner(event.target.value) }} />
            <select className="acrylBlendsSearch" aria-label="Who can see it" value={visibility} onChange={(event) => { setVisibility(event.target.value === 'public' ? 'public' : 'private') }}>
              <option value="private">Private: only you and people you invite</option>
              <option value="public">Public: anyone can see it</option>
            </select>
            {visibility === 'public' && (
              <label className="acrylBlendsMeta">
                <input type="checkbox" checked={list !== undefined} onChange={(event) => { setList(event.target.checked ? {} : undefined) }} /> List it in the Blends store
              </label>
            )}
            <button type="submit" className="acrylBlendsAppButton" disabled={!ready || step.kind === 'busy'}>{step.kind === 'busy' ? 'Reading…' : 'Review what would be sent'}</button>
          </span>
          <small>{ready ? 'The plan comes first: which repository, who can see it, and what is saved first.' : 'Connect GitHub first (above).'}</small>
        </form>
      )}
    </div>
  )
}
