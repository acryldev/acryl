import { Terminal } from '@xterm/headless'
import { afterAll, describe, expect, it } from 'vitest'
import { spawnNodePty } from '../../src/pty/node-pty-spawn.ts'
import { WorkspacePtyRegistry } from '../../src/pty/service.ts'

/**
 * A real PTY and a real shell, driven the way a full-screen agent drives a terminal: alternate screen,
 * cursor addressing, a burst of output, a resize. A view that attaches afterwards (reload, reconnect)
 * must be given exactly the screen that is showing, which replaying raw history cannot do.
 */
const registry = new WorkspacePtyRegistry({ spawn: spawnNodePty, env: { ...process.env, SHELL: '/bin/sh', PATH: '/usr/bin:/bin' }, platform: process.platform })
afterAll(async () => { await registry.disposeAll() })

async function until(check: () => boolean, ms = 8000): Promise<void> {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (check()) return
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error('timed out waiting')
}

async function attach(id: string, cols: number, rows: number): Promise<Terminal> {
  const subscription = registry.subscribe(id, 0, () => {})
  subscription.dispose()
  const terminal = new Terminal({ cols, rows, scrollback: 5000, allowProposedApi: true })
  await new Promise<void>(resolve => { terminal.write(subscription.replay.data, resolve) })
  return terminal
}

const text = (terminal: Terminal): string[] => {
  const buffer = terminal.buffer.active
  return Array.from({ length: buffer.length }, (_, i) => buffer.getLine(i)?.translateToString(true) ?? '')
}

describe.skipIf(process.platform === 'win32')('a full-screen program on a real PTY', () => {
  it('restores the alternate screen for a view that attaches later, at the resized size', async () => {
    const view = registry.start('shell', undefined, { cols: 60, rows: 15 })
    registry.write(view.id, `printf '\\033[?1049h\\033[2J\\033[1;1HTITLE BAR\\033[6;4Hbody line\\033[15;1Hstatus'; sleep 30\r`)
    await until(() => registry.read(view.id).output.includes('status'))
    registry.resize(view.id, 80, 20)
    await new Promise(resolve => setTimeout(resolve, 300))
    const late = await attach(view.id, 80, 20)
    expect(late.buffer.active.type).toBe('alternate')
    const rows = text(late)
    expect(rows[0]).toBe('TITLE BAR')
    expect(rows[5]).toBe('   body line')
    expect(rows[14]).toBe('status')
    late.dispose()
    await registry.close(view.id)
  })

  it('keeps every line of a large burst of output', async () => {
    const view = registry.start('shell', undefined, { cols: 100, rows: 30 })
    // The marker is computed, so the shell echoing the typed command cannot be mistaken for the finish.
    registry.write(view.id, 'seq 1 30000; echo DONE-$((1+1))\r')
    await until(() => registry.read(view.id).output.includes('DONE-2'), 20000)
    await new Promise(resolve => setTimeout(resolve, 300))
    const late = await attach(view.id, 100, 30)
    const all = text(late)
    expect(all).toContain('30000')
    expect(all).toContain('DONE-2')
    late.dispose()
    await registry.close(view.id)
  })

  it('refuses a size the Host would not accept', () => {
    expect(() => registry.start('shell', undefined, { cols: 1, rows: 10 })).toThrow('size')
    expect(() => registry.start('shell', undefined, { cols: 100, rows: 5000 })).toThrow('size')
  })
})
