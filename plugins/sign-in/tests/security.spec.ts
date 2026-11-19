/**
 * The security seam around a sign-in: a fake authorization flow performs a browser-style login (it sends the person to a
 * page, then waits for the redirect URL), the harness side stores the grant, and the sign-in's own views never carry the
 * answer or the token. The last assertion scans an app folder and its `.acryl` directory: neither holds a token string.
 *
 * This is the model of the real split: the harness's authorization and credentials services own tokens (the credentials
 * document under the harness home); `acryl-sign-in` only relays notices and prompts and asks the owner to write.
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { AuthorizationBeginRequest } from 'acryl-control'
import { SignInController, type SignInPorts } from '../src/controller.ts'

const BROWSER_CODE = 'oauth-browser-code-8f3f9c'
const ACCESS_TOKEN = 'oauth-access-token-2a7e5d'
const tick = () => new Promise<void>(resolve => { setTimeout(resolve, 0) })

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
})

/** An app folder with the files a token could be mistaken into: the app's own files and the door's `.acryl` log. */
function appFolder(): string {
  const app = mkdtempSync(join(tmpdir(), 'acryl-sign-in-app-'))
  cleanups.push(() => rmSync(app, { recursive: true, force: true }))
  mkdirSync(join(app, '.acryl'))
  writeFileSync(join(app, '.acryl', 'audit.log'), 'door: brief {"ok":true}\n')
  writeFileSync(join(app, 'package.json'), '{"name":"app","version":"0.1.0"}\n')
  return app
}

/** Every file's text under `folder` (the fixture app is small; node_modules is not part of it). */
function textOf(folder: string): string {
  return readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => readFileSync(join(entry.parentPath, entry.name), 'utf8'))
    .join('\n')
}

describe('a browser-style sign-in through a fake flow', () => {
  it('moves running to authorized, keeps the answer and the token out of every view, and writes no token under the app', async () => {
    const app = appFolder()
    // The harness's own store, in memory here: the flow writes the grant, never the sign-in package.
    const harnessStore: Record<string, unknown> = {}
    const ports: SignInPorts = {
      newId: (() => { let id = 0; return () => `id-${++id}` })(),
      authorization: {
        list: () => [{ key: 'llm-pi-ai/fake', label: 'Fake provider', methods: [{ id: 'oauth', label: 'Sign in with Fake' }] }],
        begin: async (request: AuthorizationBeginRequest) => {
          request.interaction.notify({ message: 'Open the sign-in page', url: 'https://example.invalid/authorize' })
          const redirect = await request.interaction.prompt({ kind: 'text', message: 'Paste the redirect URL' })
          // The flow owns the token: it stores the grant in the harness's own credential store, not in the app.
          harnessStore[request.key] = { kind: 'grant', payload: { access_token: ACCESS_TOKEN, redirect } }
          return { status: 'authorized' }
        },
      },
      credentials: { describeRecord: async key => ({ configured: harnessStore[key] !== undefined }) },
    }
    const controller = new SignInController(ports)

    const running = await controller.begin('llm-pi-ai/fake', 'oauth')
    expect(running.phase).toBe('running')
    const waiting = await controller.attempt()
    expect(waiting?.prompt?.message).toBe('Paste the redirect URL')
    expect(waiting?.notices.some(notice => notice.url === 'https://example.invalid/authorize')).toBe(true)

    controller.answer(waiting!.id, waiting!.prompt!.id, `https://example.invalid/callback?code=${BROWSER_CODE}`)
    await tick()
    const authorized = await controller.attempt()
    expect(authorized?.phase).toBe('authorized')
    expect((await controller.providers()).signedIn).toBe(true)

    // The surface's views never carry the answer or the token.
    const views = JSON.stringify({ running, waiting, authorized, providers: await controller.providers() })
    expect(views).not.toContain(BROWSER_CODE)
    expect(views).not.toContain(ACCESS_TOKEN)
    // The harness store holds it; the app folder and its .acryl do not.
    expect(JSON.stringify(harnessStore)).toContain(ACCESS_TOKEN)
    const onDisk = textOf(app)
    expect(onDisk).not.toContain(ACCESS_TOKEN)
    expect(onDisk).not.toContain(BROWSER_CODE)
  })
})
