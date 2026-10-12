/**
 * The terminal's DeepSeek account sign-in (`account-callback` capability, research R44) through a real Loader: the rows
 * the capability declares, the built `acryl-sign-in/account-callback`, a real loopback server, and a stand-in for DeepSeek's
 * account service that uses `webServer` exactly as `dsh-deepseek-account-platform` does (`ctx.get('webServer')`, one exact
 * `/oauth/callback` route per attempt). The server must be visible to the account row only.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context, type FiberState } from '@deepseek-ai/cordis'
import { Loader } from '@deepseek-ai/cordis-plugin-loader'
import { ACCOUNT_SIGN_IN_SERVICE, type AccountSignInPort } from 'acryl-control'
import { afterEach, describe, expect, it } from 'vitest'
import { ACRYL_CODING_CAPABILITIES } from '../src/coding-capabilities.ts'

const ACTIVE = 2 as FiberState.ACTIVE

/** The rows exactly as the capability declares them: the callback row and the `deepseek-account` row's isolation. */
function declaredRows() {
  const capability = ACRYL_CODING_CAPABILITIES.find(candidate => candidate.id === 'account-callback')
  if (capability === undefined) throw new Error('account-callback capability is not declared')
  const [insertPatch, accountPatch] = capability.loaderPatches
  const callback = insertPatch?.insert?.[0]
  if (callback === undefined || accountPatch?.id !== 'deepseek-account') throw new Error('unexpected account-callback patches')
  return { callback, accountIsolate: accountPatch.isolate as Record<string, string> }
}

/** DeepSeek's account service, reduced to how it uses `webServer` and what `AccountSignIn` reads. */
const FAKE_ACCOUNT = `
export const name = 'fake-deepseek-account'
export function apply(ctx) {
  let view = { status: 'signed-out', attempt: null }
  const listeners = new Set()
  const set = (attempt) => { view = { ...view, attempt }; for (const listener of listeners) listener() }
  let count = 0
  ctx.reflect.provide('deepseekAccount', {
    async getState() { return view },
    async startSignIn(client, origin, loginSource) {
      const web = ctx.get('webServer')
      if (web === undefined) throw new Error('protocol')
      const id = 'attempt-' + String(++count)
      const dispose = web.register({ kind: 'exact', path: '/oauth/callback', handler: (req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1')
        if (url.searchParams.get('state') !== id) { res.writeHead(400).end(); return }
        res.writeHead(204).end()
        dispose()
        set({ id, phase: 'succeeded' })
      } })
      set({ id, phase: 'waiting-browser', authorizeUrl: origin + '/oauth/callback?code=c&state=' + id + '&source=' + loginSource })
      return view
    },
    async cancelSignIn(id) { if (view.attempt?.id === id) set({ id, phase: 'cancelled' }); return view },
    async *watch(signal) {
      let dirty = true
      let wake
      const changed = () => { dirty = true; wake?.() }
      listeners.add(changed)
      signal.addEventListener('abort', changed, { once: true })
      try {
        while (!signal.aborted) {
          if (dirty) { dirty = false; yield view; continue }
          await new Promise(resolve => { wake = resolve })
        }
      } finally { listeners.delete(changed) }
    },
  })
}
`

/** A row that is not in the realm: it must not see the callback server. */
const NEIGHBOR = `
export const name = 'neighbor'
export function apply(ctx) { ctx.reflect.provide('neighborProbe', { seesWebServer: () => ctx.get('webServer') !== undefined }) }
`

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

async function mount() {
  const root = mkdtempSync(join(tmpdir(), 'acryl-account-callback-'))
  roots.push(root)
  writeFileSync(join(root, 'callback.mjs'), `export * from ${JSON.stringify(import.meta.resolve('acryl-sign-in/account-callback'))}\n`)
  writeFileSync(join(root, 'account.mjs'), FAKE_ACCOUNT)
  writeFileSync(join(root, 'neighbor.mjs'), NEIGHBOR)
  const { callback, accountIsolate } = declaredRows()
  const ctx = new Context()
  await ctx.plugin(Loader, { baseUrl: `file://${root}/` })
  const accountId = await ctx.loader.create({ id: 'deepseek-account', name: './account.mjs', isolate: accountIsolate })
  const callbackId = await ctx.loader.create({ ...callback, name: './callback.mjs' })
  await ctx.loader.create({ id: 'neighbor', name: './neighbor.mjs' })
  await ctx.loader.await()
  const signIn = (): AccountSignInPort => {
    const port = ctx.get(ACCOUNT_SIGN_IN_SERVICE) as AccountSignInPort | undefined
    if (port === undefined) throw new Error('acrylAccountSignIn is not provided')
    return port
  }
  const state = (id: string) => [...ctx.loader.entries()].find(entry => entry.id === id)?.fiber?.state
  return { ctx, signIn, state, accountId, callbackId }
}

describe('account-callback through a real Loader', () => {
  it('signs in: the account row registers its callback, the browser reaches it over loopback HTTP, the sign-in settles', async () => {
    const { signIn, state, accountId, callbackId } = await mount()
    expect(state(accountId)).toBe(ACTIVE)
    expect(state(callbackId)).toBe(ACTIVE)
    const opened: string[] = []
    const outcome = await signIn().signIn({
      notify(url) {
        opened.push(url)
        void fetch(url)
      },
    })
    expect(outcome).toEqual({ status: 'authorized' })
    expect(opened).toHaveLength(1)
    expect(opened[0]).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/oauth\/callback\?code=c&state=attempt-1&source=desktop$/)
  })

  it('serves the callback server to the account row only: a sibling row and the root see no webServer', async () => {
    const { ctx } = await mount()
    const probe = ctx.get('neighborProbe' as never) as { seesWebServer(): boolean }
    expect(probe.seesWebServer()).toBe(false)
    expect(ctx.get('webServer')).toBeUndefined()
  })

  it('answers 404 for any other path and refuses a request for another host name', async () => {
    const { signIn } = await mount()
    let origin = ''
    const running = signIn().signIn({ notify(url) { origin = new URL(url).origin } })
    await until(() => origin !== '')
    expect((await fetch(`${origin}/v1/chat/completions`)).status).toBe(404)
    // A DNS-rebound name pointing at the port (fetch drops a Host header, so a plain request).
    expect(await statusFor(`${origin}/oauth/callback?code=c&state=attempt-1`, `rebound.example:${new URL(origin).port}`)).toBe(421)
    await fetch(`${origin}/oauth/callback?code=c&state=attempt-1`)
    expect(await running).toEqual({ status: 'authorized' })
  })

  it('cancels the attempt when the caller aborts', async () => {
    const { signIn } = await mount()
    const abort = new AbortController()
    const outcome = signIn().signIn({ signal: abort.signal, notify() { abort.abort() } })
    expect(await outcome).toEqual({ status: 'cancelled' })
  })

  it('closes the port and withdraws its services when the row unloads', async () => {
    const { ctx, signIn, callbackId } = await mount()
    let origin = ''
    const abort = new AbortController()
    const running = signIn().signIn({ signal: abort.signal, notify(url) { origin = new URL(url).origin } })
    await until(() => origin !== '')
    abort.abort()
    await running
    await ctx.loader.remove(callbackId)
    await ctx.loader.await()
    expect(ctx.get(ACCOUNT_SIGN_IN_SERVICE)).toBeUndefined()
    await expect(fetch(`${origin}/oauth/callback`)).rejects.toThrow()
  })
})

function statusFor(url: string, host: string): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    request(url, { headers: { host } }, (res) => { res.resume(); resolve(res.statusCode) }).on('error', reject).end()
  })
}

async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 300; i += 1) {
    if (check()) return
    await new Promise(resolve => { setTimeout(resolve, 10) })
  }
  throw new Error('timed out')
}
