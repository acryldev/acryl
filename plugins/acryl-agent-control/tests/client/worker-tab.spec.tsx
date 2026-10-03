// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkerTab } from '../../src/client/worker-tab/WorkerTab.tsx'
import { parseWorkerState, serializeWorkerState } from '../../src/client/worker-tab/worker-state.ts'
import type { WorkersApi } from '../../src/client/worker-tab/workers-api.ts'
import type { WorkerRequest, WorkerResponse } from '../../src/workers-contract.ts'

afterEach(cleanup)

function harness(answer: (request: WorkerRequest) => WorkerResponse, saved?: string) {
  const requests: WorkerRequest[] = []
  const api: WorkersApi = { call: async (request) => { requests.push(request); return answer(request) } }
  const setState = vi.fn()
  const setTitle = vi.fn()
  render(<WorkerTab state={saved} api={api} setState={setState} setTitle={setTitle} />)
  return { requests, setState, setTitle }
}

const reply = (text: string): WorkerResponse => ({ ok: true, result: { text, isError: false, sessionId: 's1' } })

describe('Claude worker tab', () => {
  it('starts a worker in the typed folder, names the tab for it, and saves the worker with the workspace', async () => {
    const { requests, setState, setTitle } = harness(request => request.op === 'attach' ? { ok: true, result: { workerId: 'w1' } } : reply('x'))
    fireEvent.change(screen.getByLabelText('Folder for Claude'), { target: { value: '/p/proj' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Start Claude' })) })
    expect(requests).toEqual([{ op: 'attach', provider: 'claude', cwd: '/p/proj' }])
    expect(setTitle).toHaveBeenCalledWith('Claude: proj')
    expect(JSON.parse(setState.mock.calls.at(-1)?.[0] as string)).toMatchObject({ cwd: '/p/proj', workerId: 'w1' })
    expect(screen.getByLabelText('Message to Claude')).toBeTruthy()
  })

  it('shows the Host\'s own words when a folder is refused, and stays on the form', async () => {
    harness(() => ({ ok: false, code: 'invalid', message: '/nope does not exist' }))
    fireEvent.change(screen.getByLabelText('Folder for Claude'), { target: { value: '/nope' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Start Claude' })) })
    expect((await screen.findByRole('alert')).textContent).toBe('/nope does not exist')
    expect(screen.queryByLabelText('Message to Claude')).toBeNull()
  })

  it('sends a message, shows the answer, and keeps the transcript in the saved state', async () => {
    const saved = serializeWorkerState({ cwd: '/p', workerId: 'w1', messages: [] })
    const { requests, setState } = harness(() => reply('pong'), saved)
    fireEvent.change(screen.getByLabelText('Message to Claude'), { target: { value: 'ping' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send' })) })
    expect(requests).toEqual([{ op: 'send', workerId: 'w1', text: 'ping' }])
    expect(screen.getByRole('log').textContent).toContain('ping')
    expect(screen.getByRole('log').textContent).toContain('pong')
    expect(parseWorkerState(setState.mock.calls.at(-1)?.[0] as string).messages.map(message => message.role)).toEqual(['you', 'agent'])
  })

  it('says the worker is gone and offers a fresh start when the Host no longer has it', async () => {
    const saved = serializeWorkerState({ cwd: '/p', workerId: 'w1', messages: [{ role: 'you', text: 'old' }] })
    harness(() => ({ ok: false, code: 'unknown-worker', message: 'Unknown agent worker w1.' }), saved)
    fireEvent.change(screen.getByLabelText('Message to Claude'), { target: { value: 'hi' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send' })) })
    expect(screen.getByLabelText('Folder for Claude')).toBeTruthy()
    expect(screen.getByRole('log').textContent).toContain('no longer running')
  })

  it('stops the worker and returns to the form', async () => {
    const saved = serializeWorkerState({ cwd: '/p', workerId: 'w1', messages: [] })
    const { requests } = harness(() => ({ ok: true, result: { stopped: true } }), saved)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Stop worker' })) })
    expect(requests).toEqual([{ op: 'stop', workerId: 'w1' }])
    expect(screen.getByLabelText('Folder for Claude')).toBeTruthy()
  })

  it('treats unreadable saved state as a new tab', () => {
    expect(parseWorkerState('{not json')).toEqual({ cwd: '', workerId: undefined, messages: [] })
    expect(parseWorkerState(JSON.stringify({ cwd: 3, workerId: 4, messages: [{ role: 'x', text: 1 }, { role: 'you', text: 'ok' }] }))).toEqual({ cwd: '', workerId: undefined, messages: [{ role: 'you', text: 'ok' }] })
  })
})
