import { describe, expect, it, vi } from 'vitest'
import type { CanvasPtyView } from '../src/canvas-pty-contract.ts'
import type { CanvasPtyApi } from '../src/client/development-canvas/pty-api.ts'
import { CanvasPtyClient } from '../src/client/development-canvas/session-client.ts'

const running = (id: string): CanvasPtyView => ({
  id,
  status: 'running',
  output: '',
  exitCode: null,
  error: null,
})

function fakeApi(start: CanvasPtyApi['start']): CanvasPtyApi {
  return {
    start,
    read: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  }
}

describe('CanvasPtyClient', () => {
  it('closes every session owned by its Client activation', async () => {
    const api = fakeApi(vi.fn()
      .mockResolvedValueOnce(running('pty_1'))
      .mockResolvedValueOnce(running('pty_2')))
    const client = new CanvasPtyClient(api)

    await client.start('shell')
    await client.start('codex')
    await client.close('pty_1')
    await client.dispose()
    await client.dispose()

    expect(api.close).toHaveBeenCalledTimes(2)
    expect(api.close).toHaveBeenNthCalledWith(1, 'pty_1')
    expect(api.close).toHaveBeenNthCalledWith(2, 'pty_2')
  })

  it('retries a failed close during Client disposal', async () => {
    const api = fakeApi(vi.fn().mockResolvedValue(running('pty_retry')))
    vi.mocked(api.close)
      .mockRejectedValueOnce(new Error('network interrupted'))
      .mockResolvedValueOnce(undefined)
    const client = new CanvasPtyClient(api)

    await client.start('shell')
    await expect(client.close('pty_retry')).rejects.toThrow('network interrupted')
    await client.dispose()

    expect(api.close).toHaveBeenCalledTimes(2)
  })

  it('closes a session whose start settles during disposal', async () => {
    let resolveStart!: (view: CanvasPtyView) => void
    const api = fakeApi(() => new Promise(resolve => { resolveStart = resolve }))
    const client = new CanvasPtyClient(api)

    const starting = client.start('shell')
    const disposing = client.dispose()
    resolveStart(running('pty_late'))

    await expect(starting).rejects.toThrow('Canvas PTY client is disposed')
    await disposing
    expect(api.close).toHaveBeenCalledWith('pty_late')
  })
})
