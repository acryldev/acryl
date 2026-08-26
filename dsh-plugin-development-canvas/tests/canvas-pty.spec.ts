import { describe, expect, it, vi } from 'vitest'
import {
  CanvasPtyRegistry,
  type CanvasPtyProcess,
  planCanvasPtyCommand,
} from '../src/canvas-pty.ts'

function fakePty(): {
  readonly process: CanvasPtyProcess
  readonly emitData: (data: string) => void
  readonly write: ReturnType<typeof vi.fn>
  readonly resize: ReturnType<typeof vi.fn>
  readonly killed: () => boolean
} {
  const dataListeners = new Set<(data: string) => void>()
  const exitListeners = new Set<(event: { exitCode: number; signal?: number }) => void>()
  const write = vi.fn()
  const resize = vi.fn()
  let killed = false
  const process: CanvasPtyProcess = {
    onData(listener) {
      dataListeners.add(listener)
      return { dispose: () => { dataListeners.delete(listener) } }
    },
    onExit(listener) {
      exitListeners.add(listener)
      return { dispose: () => { exitListeners.delete(listener) } }
    },
    write,
    resize,
    kill() {
      if (killed) return
      killed = true
      queueMicrotask(() => {
        for (const listener of exitListeners) listener({ exitCode: 0 })
      })
    },
  }
  return {
    process,
    emitData: data => { for (const listener of dataListeners) listener(data) },
    write,
    resize,
    killed: () => killed,
  }
}

async function waitForOutput(
  registry: CanvasPtyRegistry,
  id: string,
  marker: string,
): Promise<string> {
  const deadline = Date.now() + 2_000
  while (Date.now() < deadline) {
    const output = registry.read(id).output
    if (output.includes(marker)) return output
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  return registry.read(id).output
}

describe('CanvasPtyRegistry', () => {
  it('plans allowlisted argv', () => {
    expect(planCanvasPtyCommand('shell', 'darwin', { SHELL: '/bin/zsh' })).toEqual({
      command: '/bin/zsh',
      args: [],
    })
    expect(planCanvasPtyCommand('claude', 'darwin', {})).toEqual({
      command: 'claude',
      args: [],
    })
  })

  it('streams output and disposes the child', async () => {
    const pty = fakePty()
    const registry = new CanvasPtyRegistry({
      createId: () => 'pty_1',
      spawn: () => pty.process,
    })
    const started = registry.start('shell')
    expect(started.id).toBe('pty_1')
    expect(started.status).toBe('running')
    pty.emitData('hello from shell\n')
    expect(registry.read('pty_1').output).toBe('hello from shell\n')
    registry.write('pty_1', 'ls\n')
    expect(pty.write).toHaveBeenCalledWith('ls\n')
    registry.resize('pty_1', 132, 48)
    expect(pty.resize).toHaveBeenCalledWith(132, 48)
    await registry.disposeAll()
    expect(pty.killed()).toBe(true)
    expect(() => registry.read('pty_1')).toThrow('unknown canvas PTY session')
  })

  it.skipIf(process.platform === 'win32')('gives interactive commands a real terminal', async () => {
    const registry = new CanvasPtyRegistry({
      env: { ...process.env, SHELL: '/bin/sh' },
      platform: process.platform,
    })
    const started = registry.start('shell')
    registry.write(
      started.id,
      "if [ -t 0 ]; then printf '\\137\\137CANVAS_TTY_OK\\137\\137\\n'; else printf '\\137\\137CANVAS_TTY_MISSING\\137\\137\\n'; fi\nexit\n",
    )
    const output = await waitForOutput(registry, started.id, '__CANVAS_TTY_')
    await registry.disposeAll()
    expect(output).toContain('__CANVAS_TTY_OK__')
    expect(output).not.toContain('__CANVAS_TTY_MISSING__')
  })

  it('rejects unknown command ids before spawn', () => {
    const spawn = vi.fn()
    const registry = new CanvasPtyRegistry({ spawn })
    expect(() => registry.start('rm')).toThrow('unknown canvas PTY command')
    expect(spawn).not.toHaveBeenCalled()
  })
})
