// @vitest-environment jsdom

/** Settings > Share: the whole app to the person's own GitHub, through the app's own share command - the plan first, sent only on a yes. */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppShareRefused, appShareCommand, SHARE_COMMAND } from '../src/app-share.ts'
import type { AppSharePlanView } from '../src/contract.ts'
import { type ShareAppApi, ShareAppSection } from '../src/client/ShareAppSection.tsx'

afterEach(() => { cleanup() })

const PLAN: AppSharePlanView = { repository: 'ana/shop', create: true, visibility: 'public', changes: 2 }

function appFolder(): string {
  const root = mkdtempSync(join(tmpdir(), 'frame-app-share-'))
  mkdirSync(join(root, 'plugins', 'save'), { recursive: true })
  writeFileSync(join(root, SHARE_COMMAND), '')
  return root
}

describe('the share command port', () => {
  it('asks the app for its plan with the person\'s choices, and sends exactly the confirmed plan', async () => {
    const root = appFolder()
    try {
      const calls: string[][] = []
      const port = appShareCommand(root, {}, async (args) => {
        calls.push([...args])
        return args.includes('--confirm')
          ? { code: 0, stdout: 'saving...\n{"ok":true,"remote":"https://github.com/ana/shop.git","created":true}\n', stderr: '' }
          : { code: 0, stdout: `${JSON.stringify(PLAN)}\n`, stderr: '' }
      })
      expect(await port.plan({ owner: 'ana', visibility: 'public' })).toEqual(PLAN)
      expect(calls[0]).toEqual(['--json', '--owner', 'ana', '--visibility', 'public'])
      expect(await port.share({ visibility: 'public' }, PLAN)).toEqual({ remote: 'https://github.com/ana/shop.git', created: true })
      const confirm = calls[1]?.[calls[1].indexOf('--confirm') + 1] ?? ''
      expect(JSON.parse(Buffer.from(confirm, 'base64url').toString('utf8'))).toEqual(PLAN)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it('says the app\'s own reason when it refuses, and what to do for an app made before apps could share', async () => {
    const root = appFolder()
    try {
      const port = appShareCommand(root, {}, async () => ({ code: 1, stdout: '{"ok":false,"reason":"you are not signed in to GitHub"}\n', stderr: '' }))
      await expect(port.plan({})).rejects.toThrow(new AppShareRefused('Not shared: you are not signed in to GitHub'))
      rmSync(join(root, SHARE_COMMAND))
      await expect(port.plan({})).rejects.toThrow(/made before apps could share themselves/u)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
})

describe('Settings > Share', () => {
  const registry = { github: vi.fn(async () => ({ status: 'ready' as const })), connect: { start: vi.fn(), state: vi.fn() } }

  it('shows the plan first and shares only on the person\'s yes, with the visibility they chose', async () => {
    const share: ShareAppApi = { plan: vi.fn(async () => PLAN), share: vi.fn(async () => ({ remote: 'https://github.com/ana/shop.git', created: true })) }
    render(<ShareAppSection share={share} registry={registry as never} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Who can see it' }), { target: { value: 'public' } })
    await waitFor(() => { expect((screen.getByRole('button', { name: 'Review what would be sent' }) as HTMLButtonElement).disabled).toBe(false) })
    fireEvent.click(screen.getByRole('button', { name: 'Review what would be sent' }))
    expect(await screen.findByText('github.com/ana/shop (a new repository)')).toBeTruthy()
    expect(share.plan).toHaveBeenCalledWith({ visibility: 'public' })
    expect(share.share).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Yes, share this app' }))
    expect(await screen.findByText('git clone https://github.com/ana/shop.git')).toBeTruthy()
    expect(share.share).toHaveBeenCalledWith({ visibility: 'public' }, PLAN)
  })

  it('cannot be started before GitHub is connected', async () => {
    const signedOut = { github: vi.fn(async () => ({ status: 'signed-out' as const, say: 'GitHub is not connected on this computer.', command: 'gh auth login' })), connect: undefined }
    const share: ShareAppApi = { plan: vi.fn(), share: vi.fn() }
    render(<ShareAppSection share={share} registry={signedOut as never} />)
    expect(await screen.findByText('GitHub is not connected on this computer.')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Review what would be sent' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
