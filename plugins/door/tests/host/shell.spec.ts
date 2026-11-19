/**
 * The desktop shell's side of the door: the channel (one shell, calls and answers, a reconnect), the routes (the door's secret and nothing else), and the window and menu verbs
 * through a fake shell that speaks the real protocol over a real server: the audit with the window id, the last window that is not closed by accident, and the one clear line when
 * no desktop is attached.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readDoorFile } from '../../src/host/door-file.ts'
import { NO_DESKTOP, ShellChannel } from '../../src/host/shell.ts'
import { ShellError, type ShellCall, type ShellResult, type ShellWindow } from '../../src/shell/protocol.ts'
import { appFolder, fetchSource, operator, pageHeaders, removeFolders, startApp, type Running } from '../harness.ts'

const apps: Running[] = []
afterEach(async () => {
  while (apps.length > 0) await apps.pop()?.close()
  removeFolders()
})

async function app(): Promise<Running> {
  const running = await startApp({ root: appFolder() })
  apps.push(running)
  return running
}

/** A fake desktop shell: connects the way the Electron main process does and answers from `windows`. */
async function shell(running: Running, handler?: (call: ShellCall) => ShellResult | ShellError) {
  const { secret } = readDoorFile(running.root) as { secret: string }
  const headers = { authorization: `Bearer ${secret}` }
  const windows: ShellWindow[] = [{ id: 1, title: 'demo', path: '/', focused: true, width: 1000, height: 700 }]
  const calls: ShellCall[] = []
  const controller = new AbortController()
  const response = await fetch(`${running.origin}/api/acryl-door/shell/events`, { headers, signal: controller.signal })
  expect(response.status).toBe(200)
  const reader = (response.body as ReadableStream<Uint8Array>).getReader()
  void (async () => {
    const decoder = new TextDecoder()
    let buffer = ''
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let end: number
        while ((end = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, end)
          buffer = buffer.slice(end + 2)
          if (!block.includes('event: call')) continue
          const call = JSON.parse(block.split('\n').find(line => line.startsWith('data:'))?.slice(5) ?? '{}') as ShellCall
          calls.push(call)
          const answer = handler?.(call) ?? defaultAnswer(call, windows)
          const body = answer instanceof ShellError
            ? { t: 'error', id: call.id, code: answer.code, message: answer.message }
            : { t: 'result', id: call.id, value: answer }
          await fetch(`${running.origin}/api/acryl-door/shell/answer`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body) })
        }
      }
    } catch {
      // The test ended the stream.
    }
  })()
  return { calls, windows, stop: () => { controller.abort() } }
}

function defaultAnswer(call: ShellCall, windows: ShellWindow[]): ShellResult {
  const request = call.request
  switch (request.op) {
    case 'window-list': return { windows }
    case 'window-open': {
      const id = Math.max(...windows.map(window => window.id)) + 1
      windows.push({ id, title: 'demo', path: request.path ?? '/', focused: false, width: 800, height: 600 })
      return { ok: true, detail: `opened window ${String(id)} on ${request.path ?? '/'}`, id }
    }
    case 'window-close': windows.splice(windows.findIndex(window => window.id === request.id), 1); return { ok: true, detail: `closed window ${String(request.id)}` }
    case 'window-focus': return { ok: true, detail: `focused window ${String(request.id)}` }
    case 'window-resize': return { ok: true, detail: `window ${String(request.id)} is now ${String(request.width)}x${String(request.height)}` }
    case 'menu-list': return { items: [{ path: 'File>New Note', label: 'New Note', enabled: true }, { path: 'File>Export', label: 'Export', enabled: false }, { path: 'app>Quit', label: 'Quit', enabled: true, ends: true }] }
    case 'menu-click': return { ok: true, detail: `pressed ${request.path}` }
  }
}

const auditLines = (running: Running): Array<Record<string, unknown>> =>
  readFileSync(join(running.root, '.acryl', 'audit', 'ui-control.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line) as Record<string, unknown>)

describe('the shell channel', () => {
  it('answers no-desktop at once when no shell is attached, and carries a call and its answer when one is', async () => {
    const channel = new ShellChannel()
    await expect(channel.call({ op: 'window-list' })).rejects.toMatchObject({ code: 'no-desktop', message: NO_DESKTOP })
    const sent: string[] = []
    channel.attach({ send: data => { sent.push(data) }, close: () => undefined })
    const pending = channel.call({ op: 'window-focus', id: 2 })
    const call = JSON.parse(sent[0] as string) as ShellCall
    expect(call.request).toEqual({ op: 'window-focus', id: 2 })
    channel.receive({ t: 'result', id: call.id, value: { ok: true, detail: 'focused window 2' } })
    await expect(pending).resolves.toEqual({ ok: true, detail: 'focused window 2' })
    // An id nobody asked for, and a malformed answer, change nothing.
    channel.receive({ t: 'result', id: 999, value: { ok: true, detail: 'x' } })
    channel.receive({ nonsense: true })
  })

  it('fails the calls in flight when the shell goes away or a new one replaces it, and waits for a shell that comes back', async () => {
    const channel = new ShellChannel()
    const end = channel.attach({ send: () => undefined, close: () => undefined })
    const first = channel.call({ op: 'menu-list' })
    end()
    await expect(first).rejects.toMatchObject({ code: 'disconnected' })
    expect(channel.connected).toBe(false)
    const back = channel.waitForShell(1000)
    channel.attach({ send: () => undefined, close: () => undefined })
    await expect(back).resolves.toBe(true)
    const second = channel.call({ op: 'menu-list' })
    channel.attach({ send: () => undefined, close: () => undefined })
    await expect(second).rejects.toMatchObject({ code: 'disconnected' })
    await expect(new ShellChannel().waitForShell(20)).resolves.toBe(false)
  })

  it('gives up on a shell that does not answer', async () => {
    const channel = new ShellChannel()
    channel.attach({ send: () => undefined, close: () => undefined })
    await expect(channel.call({ op: 'menu-list' }, { timeoutMs: 30 })).rejects.toMatchObject({ code: 'timeout' })
  })
})

describe('the shell routes', () => {
  it('are for the holder of this run\'s secret: a page, a script with no secret and a wrong secret are refused', async () => {
    const running = await app()
    const events = `${running.origin}/api/acryl-door/shell/events`
    const answer = `${running.origin}/api/acryl-door/shell/answer`
    expect((await fetch(events, { headers: pageHeaders(running.origin) })).status).toBe(403)
    expect((await fetch(events)).status).toBe(403)
    expect((await fetch(events, { headers: { authorization: 'Bearer wrong' } })).status).toBe(403)
    const post = await fetch(answer, { method: 'POST', headers: { ...pageHeaders(running.origin), 'content-type': 'application/json' }, body: '{}' })
    expect(post.status).toBe(403)
    // The page channel is not the shell's: a page that tries to reach the shell stream with its own headers gets nothing, and the page stream is untouched.
    const source = fetchSource(`${running.origin}/api/acryl-door/channel?window=w1&focused=1`, pageHeaders(running.origin))
    await source.opened
    source.close()
  })
})

describe('the window and menu verbs', () => {
  it('say in one line what to run when no desktop is attached, with no wait', async () => {
    const running = await app()
    const started = Date.now()
    const listed = await operator(running.root, ['window', 'list'])
    expect(listed.code).toBe(1)
    expect(listed.err).toContain(NO_DESKTOP)
    expect(Date.now() - started).toBeLessThan(2000)
    expect((await operator(running.root, ['menu', 'click', '--path', 'File>New Note'])).err).toContain(NO_DESKTOP)
    // Refusals are in the audit too.
    expect(auditLines(running).map(line => [line.tool, line.outcome, line.detail])).toEqual([['window-list', 'refused', 'no-desktop'], ['menu-click', 'refused', 'no-desktop']])
  })

  it('list, open, focus, resize and close windows through the shell, and audit each with its window id', async () => {
    const running = await app()
    const fake = await shell(running)
    const listed = await operator(running.root, ['window', 'list'])
    expect(listed, listed.err).toMatchObject({ code: 0 })
    expect(listed.out).toContain('1  "demo"  /  1000x700  focused')
    const opened = await operator(running.root, ['window', 'open', '--path', '/settings'])
    expect(opened.out).toContain('opened window 2 on /settings')
    expect((await operator(running.root, ['window', 'focus', '--id', '2'])).code).toBe(0)
    expect((await operator(running.root, ['window', 'resize', '--id', '2', '--width', '900', '--height', '640'])).out).toContain('window 2 is now 900x640')
    expect((await operator(running.root, ['window', 'close', '--id', '2'])).out).toContain('closed window 2')
    const lines = auditLines(running)
    expect(lines.map(line => [line.tool, line.window, line.outcome])).toEqual([
      ['window-list', undefined, 'ok'], ['window-open', 2, 'ok'], ['window-focus', 2, 'ok'], ['window-resize', 2, 'ok'], ['window-close', 2, 'ok'],
    ])
    expect(fake.calls.map(call => call.request.op)).toContain('window-resize')
    fake.stop()
  })

  it('refuse to close the last window unless the call says force, and never ask the shell to', async () => {
    const running = await app()
    const fake = await shell(running)
    const refused = await operator(running.root, ['window', 'close', '--id', '1'])
    expect(refused.code).toBe(1)
    expect(refused.err).toMatch(/last window/u)
    expect(refused.err).toMatch(/force/u)
    expect(fake.calls.some(call => call.request.op === 'window-close')).toBe(false)
    expect(fake.windows).toHaveLength(1)
    const forced = await operator(running.root, ['window', 'close', '--id', '1', '--force'])
    expect(forced, forced.err).toMatchObject({ code: 0 })
    expect(fake.calls.some(call => call.request.op === 'window-close' && call.request.force === true)).toBe(true)
    expect(auditLines(running).map(line => [line.tool, line.window, line.outcome, line.detail])).toEqual([
      ['window-close', 1, 'refused', 'last-window'], ['window-close', 1, 'ok', undefined],
    ])
    fake.stop()
  })

  it('list the menu, press an item by its path, and pass on a refusal of the shell (a disabled item, an unknown window)', async () => {
    const running = await app()
    const fake = await shell(running, (call) => {
      if (call.request.op === 'menu-click' && call.request.path === 'File>Export') return new ShellError('disabled', 'File>Export is disabled')
      if (call.request.op === 'menu-click' && call.request.path === 'app>Quit' && call.request.force !== true) return new ShellError('quits-app', 'app>Quit ends the desktop app. Pass force to do it on purpose')
      if (call.request.op === 'window-focus') return new ShellError('no-such-window', 'there is no window 9; window list prints the ids')
      return defaultAnswer(call, [])
    })
    const menu = await operator(running.root, ['menu', 'list'])
    expect(menu.out).toBe('File>New Note\nFile>Export  (disabled)\napp>Quit  (ends the app; needs force)\n')
    expect((await operator(running.root, ['menu', 'click', '--path', 'File>New Note'])).out).toContain('pressed File>New Note')
    const disabled = await operator(running.root, ['menu', 'click', '--path', 'File>Export'])
    expect(disabled.code).toBe(1)
    expect(disabled.err).toContain('disabled')
    const quit = await operator(running.root, ['menu', 'click', '--path', 'app>Quit'])
    expect(quit.code).toBe(1)
    expect(quit.err).toContain('force')
    expect((await operator(running.root, ['menu', 'click', '--path', 'app>Quit', '--force'])).code).toBe(0)
    const missing = await operator(running.root, ['window', 'focus', '--id', '9'])
    expect(missing.err).toContain('no window 9')
    expect(auditLines(running).map(line => [line.tool, line.outcome, line.detail])).toEqual([
      ['menu-list', 'ok', undefined], ['menu-click', 'ok', undefined], ['menu-click', 'refused', 'disabled'], ['menu-click', 'refused', 'quits-app'], ['menu-click', 'ok', undefined], ['window-focus', 'refused', 'no-such-window'],
    ])
    fake.stop()
  })

  it('check the arguments before the shell sees them', async () => {
    const running = await app()
    const fake = await shell(running)
    for (const args of [['window', 'open', '--path', '//evil.example'], ['window', 'resize', '--id', '1', '--width', '50', '--height', '640'], ['menu', 'click', '--path', '']]) {
      const result = await operator(running.root, args)
      expect(result.code, args.join(' ')).toBe(1)
    }
    expect((await operator(running.root, ['window', 'focus'])).code).toBe(2)
    expect(fake.calls).toHaveLength(0)
    fake.stop()
  })
})

describe('look and act with a window', () => {
  it('check the window argument, and say which windows have a page when the one asked for has none', async () => {
    const running = await app()
    const bad = await operator(running.root, ['look', '--window', '0'])
    expect(bad.code).toBe(1)
    expect(bad.err).toMatch(/window must be the number/u)
    const none = await operator(running.root, ['look', '--window', '3'])
    expect(none.code).toBe(1)
    expect(none.err).toMatch(/no page of window 3 is connected/u)
    const lines = auditLines(running)
    expect(lines.map(line => [line.tool, line.window, line.outcome, line.detail])).toEqual([['look', 3, 'failed', 'no-window']])
  })
})
