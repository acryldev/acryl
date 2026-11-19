/**
 * Reload and navigate, and the reload after a live plugin change: the Door with a real channel and pages that stand in for the browser. A page that is told to reload ends its stream
 * and a new page connects; the verb answers once it is back, so the next look sees the new page.
 */

import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'
import { Door, type ExtensionsPort, type PluginSharePort } from '../../src/host/door.ts'
import { UiChannel, type PageStream } from '../../src/host/channel.ts'
import type { AuditLog } from '../../src/host/audit.ts'
import type { ChannelToPage, UiResult } from '../../src/page/protocol.ts'

const audit = { record: () => undefined } as unknown as AuditLog
const never = new AbortController().signal

/** A page: it records the calls it gets, and on a reload/navigate call it answers (or not) and comes back as a new window after `backAfterMs` (never when undefined). */
function browser(channel: UiChannel, options: { answers?: boolean; backAfterMs?: number | undefined } = {}) {
  const calls: ChannelToPage[] = []
  let counter = 0
  const open = (): void => {
    counter += 1
    const windowId = `w${String(counter)}`
    const stream: PageStream = {
      send(data) {
        const frame = JSON.parse(data) as ChannelToPage
        calls.push(frame)
        if (frame.request.op !== 'reload' && frame.request.op !== 'navigate') return
        const detail = frame.request.op === 'reload' ? 'reloading' : `going to ${frame.request.path}`
        if (options.answers !== false) channel.receive(windowId, { t: 'result', id: frame.id, value: { ok: true, detail } })
        if (options.backAfterMs !== undefined) {
          setTimeout(() => { end(); open() }, options.backAfterMs)
        }
      },
      close() { /* nothing */ },
    }
    const end = channel.attach(windowId, true, stream)
  }
  open()
  return { calls }
}

function door(channel: UiChannel, extra: { extensions?: ExtensionsPort; pluginShare?: PluginSharePort; reloadOnChange?: boolean; pageBackMs?: number } = {}): Door {
  return new Door({
    channel,
    audit,
    app: { name: 'demo', root: '/tmp/demo' },
    extensions: () => extra.extensions,
    pluginShare: () => extra.pluginShare,
    tools: () => undefined,
    expose: [],
    ...(extra.reloadOnChange === undefined ? {} : { reloadOnChange: extra.reloadOnChange }),
    pageBackMs: extra.pageBackMs ?? 1000,
  })
}

describe('an act that takes the page away', () => {
  /** A page in a tab: a click on ref 1.1 is a link (the page says it is leaving, and the next page of the tab connects), a click on 1.2 is a button that stays. */
  function tab(channel: UiChannel, name: string) {
    const calls: string[] = []
    let counter = 0
    const open = (): string => {
      counter += 1
      const windowId = `${name}${String(counter)}`
      const stream: PageStream = {
        send(data) {
          const frame = JSON.parse(data) as ChannelToPage
          calls.push(`${windowId} ${frame.request.op}`)
          const leaving = frame.request.op === 'click' && frame.request.ref === '1.1'
          const value: UiResult = frame.request.op === 'snapshot' ? { generation: 1, title: windowId, nodes: [], total: 0 }
            : leaving ? { ok: true, leaving: true, detail: 'the page is going to another address' } : { ok: true }
          channel.receive(windowId, { t: 'result', id: frame.id, value })
          if (leaving) setTimeout(() => { end(); open() }, 20)
        },
        close() { /* nothing */ },
      }
      const end = channel.attach(windowId, true, stream, undefined, `tab-${name}`)
      return windowId
    }
    return { first: open(), calls }
  }

  it("waits for the next page when a click leaves, so the look after it reads that page; a click that stays answers at once", async () => {
    const channel = new UiChannel({ requirePage: true, attachWaitMs: 500 })
    const a = tab(channel, 'a')
    const b = tab(channel, 'b')
    const stop = channel.driveFor(a.first)
    const left = await door(channel).run('act', { op: 'click', ref: '1.1' }, never, { page: a.first })
    expect(left.text).toContain('the page is back: look again')
    await door(channel).run('look', {}, never, { page: a.first })
    // The look went to the page that came back in A's tab, not to B's page, which connected last.
    expect(a.calls).toEqual(['a1 click', 'a2 snapshot'])
    expect(b.calls).toEqual([])
    const stayed = await door(channel).run('act', { op: 'click', ref: '1.2' }, never, { page: a.first })
    expect(stayed.text).not.toContain('the page is back')
    stop()
  })
})

describe('act reload and act navigate', () => {
  it('answer once the page is back, and say so', async () => {
    const channel = new UiChannel()
    const page = browser(channel, { backAfterMs: 20 })
    const reload = await door(channel).run('act', { op: 'reload' }, never)
    expect(reload.text).toContain('reloading; the page is back: look again')
    const moved = await door(channel).run('act', { op: 'navigate', path: '/demo' }, never)
    expect(moved.text).toContain('going to /demo; the page is back')
    expect(page.calls.map((call) => call.request.op)).toEqual(['reload', 'navigate'])
  })

  it('count the page dropping before it answered as the reload working', async () => {
    const channel = new UiChannel()
    browser(channel, { answers: false, backAfterMs: 20 })
    const reload = await door(channel).run('act', { op: 'reload' }, never)
    expect(reload.text).toContain('the page is back')
  })

  it('fail with a timeout that names the cause when the page does not come back, and refuse a path that leaves the app', async () => {
    const channel = new UiChannel()
    browser(channel, { backAfterMs: undefined })
    await expect(door(channel, { pageBackMs: 60 }).run('act', { op: 'navigate', path: '/nowhere' }, never)).rejects.toMatchObject({ code: 'timeout', message: expect.stringContaining('/nowhere') })
    await expect(door(channel).run('act', { op: 'navigate', path: '//evil.example' }, never)).rejects.toMatchObject({ code: 'invalid' })
    await expect(door(new UiChannel()).run('act', { op: 'reload' }, never)).rejects.toMatchObject({ code: 'no-window' })
  })
})

describe('the open pages reload after a live plugin change', () => {
  const extensions = (action = 'installed'): ExtensionsPort => ({
    install: async () => ({ ok: true, name: 'demo-ui', action }),
    remove: async () => ({ ok: true }),
    reload: async () => [],
    list: () => [],
  })

  it('on add, remove and reload, and the verb answers once the page is back', async () => {
    const channel = new UiChannel()
    const page = browser(channel, { backAfterMs: 20 })
    const d = door(channel, { extensions: extensions() })
    await d.run('plugin-add', { folder: 'plugins/demo-ui' }, never)
    await d.run('plugin-reload', {}, never)
    await d.run('plugin-remove', { name: 'demo-ui' }, never)
    expect(page.calls.filter((call) => call.request.op === 'reload')).toHaveLength(3)
  })

  it('not for a list, for a plugin that was already as it should be, or when switched off; and with no page open nothing is waited for', async () => {
    const channel = new UiChannel()
    const page = browser(channel, { backAfterMs: 20 })
    await door(channel, { extensions: extensions() }).run('plugin-list', {}, never)
    await door(channel, { extensions: extensions('unchanged') }).run('plugin-add', { folder: 'plugins/demo-ui' }, never)
    await door(channel, { extensions: extensions(), reloadOnChange: false }).run('plugin-add', { folder: 'plugins/demo-ui' }, never)
    expect(page.calls).toEqual([])
    const started = Date.now()
    await door(new UiChannel(), { extensions: extensions() }).run('plugin-add', { folder: 'plugins/demo-ui' }, never)
    expect(Date.now() - started).toBeLessThan(500)
  })
})

describe('act navigate says what the app answered at the path', () => {
  it('names a 404 so an agent that mistyped a path knows, and a 200 for a page that is there', async () => {
    const server = createServer((request, response) => {
      response.statusCode = request.url === '/demo' ? 200 : 404
      response.end('x')
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    try {
      const url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
      const channel = new UiChannel()
      browser(channel, { backAfterMs: 20 })
      const there = new Door({ channel, audit, app: { name: 'demo', root: '/tmp/demo', url }, extensions: () => undefined, tools: () => undefined, expose: [], pageBackMs: 1000 })
      const missing = await there.run('act', { op: 'navigate', path: '/nope' }, never)
      expect(missing.text).toContain('404 at /nope')
      expect(missing.text).toContain('the page is back: look again')
      const found = await there.run('act', { op: 'navigate', path: '/demo' }, never)
      expect(found.text).toContain('200 at /demo')
      expect(found.text).not.toContain('404')
      // No address (an app that does not listen): the verb still answers, without a status.
      const quiet = await door(channel).run('act', { op: 'navigate', path: '/demo' }, never)
      expect(quiet.text).toContain('going to /demo; the page is back: look again')
      expect(quiet.text).not.toMatch(/\d{3} at /u)
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  })

  it('after a pull that changed the app, not after a refusal or a pull of what is already there, and the verb needs a source and the row', async () => {
    const pulling = (answer: { ok: boolean; action?: string; reason?: string; next?: string }): PluginSharePort => ({
      list: () => [],
      remove: async () => ({ ok: true }),
      pull: async () => answer,
      pullList: async () => ({ ok: false, reason: 'unused', next: 'unused' }),
      planPublish: async () => ({ ok: false, reason: 'unused', next: 'unused' }),
      publish: async () => ({ ok: false }),
    })
    const channel = new UiChannel()
    const page = browser(channel, { backAfterMs: 20 })
    await expect(
      door(channel, { pluginShare: pulling({ ok: false, reason: 'these are different bytes', next: 'ask who gave you the digest' }) }).run('plugin-pull', { source: 'github:a/b' }, never),
    ).rejects.toMatchObject({ code: 'refused', message: 'these are different bytes. ask who gave you the digest.' })
    await door(channel, { pluginShare: pulling({ ok: true, action: 'unchanged' }) }).run('plugin-pull', { source: 'github:a/b' }, never)
    expect(page.calls).toEqual([])
    const answer = await door(channel, { pluginShare: pulling({ ok: true, action: 'installed' }) }).run('plugin-pull', { source: 'github:a/b' }, never)
    expect(answer.value).toEqual({ ok: true, action: 'installed' })
    expect(page.calls.filter((call) => call.request.op === 'reload')).toHaveLength(1)
    await expect(door(channel, { pluginShare: pulling({ ok: true }) }).run('plugin-pull', {}, never)).rejects.toThrow(/needs a source/)
    await expect(door(channel).run('plugin-pull', { source: 'github:a/b' }, never)).rejects.toThrow(/npx acrylblends add plugin-share/)
  })

  it('plugin pull --from pulls a group list: a refused source is named with its reason, the others come in, and the page reloads once', async () => {
    const asked: string[] = []
    const listing = (answer: Awaited<ReturnType<PluginSharePort['pullList']>>): PluginSharePort => ({
      list: () => [],
      remove: async () => ({ ok: true }),
      pull: async () => ({ ok: true }),
      pullList: async (from) => { asked.push(from); return answer },
      planPublish: async () => ({ ok: false, reason: 'unused', next: 'unused' }),
      publish: async () => ({ ok: false }),
    })
    const channel = new UiChannel()
    const page = browser(channel, { backAfterMs: 20 })
    const mixed = listing({
      ok: true,
      from: 'group.txt',
      entries: [
        { line: 1, source: 'github:a/hello@0.1.0', result: { ok: true, action: 'installed', name: 'hello' } },
        { line: 3, source: 'github:b/echo@0.1.0', result: { ok: false, reason: 'echo claims the route /hello, which hello already serves', next: 'ask its author to rename the route.' } },
        { line: 4, source: 'github:c/greet@0.1.0', result: { ok: true, action: 'installed', name: 'greet' } },
      ],
    })
    const refused = door(channel, { pluginShare: mixed }).run('plugin-pull', { from: 'group.txt' }, never)
    await expect(refused).rejects.toMatchObject({ code: 'refused' })
    await expect(refused).rejects.toThrow(/2 of 3 from group\.txt pulled; 1 refused, the others are in and running\.\ngithub:a\/hello@0\.1\.0: installed hello\ngithub:b\/echo@0\.1\.0: refused: echo claims the route \/hello, which hello already serves\. ask its author to rename the route\.\ngithub:c\/greet@0\.1\.0: installed greet/)
    expect(asked).toEqual(['group.txt'])
    expect(page.calls.filter((call) => call.request.op === 'reload')).toHaveLength(1)
    const clean = await door(channel, { pluginShare: listing({ ok: true, from: 'https://x.test/g.txt', entries: [{ line: 1, source: 'github:a/hello', result: { ok: true, action: 'unchanged', name: 'hello' } }] }) }).run('plugin-pull', { from: 'https://x.test/g.txt' }, never)
    expect(clean.text).toBe('1 of 1 from https://x.test/g.txt pulled.\ngithub:a/hello: unchanged hello')
    expect(page.calls.filter((call) => call.request.op === 'reload')).toHaveLength(1)
    await expect(door(channel, { pluginShare: listing({ ok: false, reason: 'group.txt: line 2 holds more than one word', next: 'fix the list; nothing was pulled' }) }).run('plugin-pull', { from: 'group.txt' }, never))
      .rejects.toMatchObject({ code: 'refused', message: 'group.txt: line 2 holds more than one word. fix the list; nothing was pulled.' })
    await expect(door(channel, { pluginShare: mixed }).run('plugin-pull', { from: 'group.txt', source: 'github:a/b' }, never)).rejects.toThrow(/not both/)
    await expect(door(channel, { pluginShare: mixed }).run('plugin-pull', { from: '' }, never)).rejects.toThrow(/needs a list/)
  })

  it('plugin list and remove go through plugin-share where the app has it, as in the frame, where the door reaches no extensions', async () => {
    const removed: string[] = []
    const share: PluginSharePort = {
      list: () => [{ name: 'pomodoro', version: '0.1.0', state: 'active', pulledFrom: 'github:inboxxobni/acrylblends-pomodoro@0.1.0', author: 'inboxxobni' }],
      remove: async (name) => { removed.push(name); return { ok: true, name, folder: 'deleted' } },
      pull: async () => ({ ok: true }),
      pullList: async () => ({ ok: false, reason: 'unused', next: 'unused' }),
      planPublish: async () => ({ ok: false, reason: 'unused', next: 'unused' }),
      publish: async () => ({ ok: false }),
    }
    const d = door(new UiChannel(), { pluginShare: share, reloadOnChange: false })
    expect((await d.run('plugin-list', {}, never)).value).toEqual(share.list())
    expect((await d.run('plugin-remove', { name: 'pomodoro' }, never)).value).toEqual({ ok: true, name: 'pomodoro', folder: 'deleted' })
    expect(removed).toEqual(['pomodoro'])
  })

  it('plugin publish answers a plan and cannot publish, whatever its arguments say', async () => {
    const plan = { owner: 'inboxxobni', repo: 'hello', version: '0.1.0', visibility: 'public', license: 'MIT', createsRepository: true, files: ['index.ts'], digest: 'd', pullLine: 'npm run acryl -- plugin pull github:inboxxobni/hello@0.1.0@sha256:d' }
    const published: unknown[] = []
    const share: PluginSharePort = {
      list: () => [],
      remove: async () => ({ ok: true }),
      pull: async () => ({ ok: true }),
      pullList: async () => ({ ok: false, reason: 'unused', next: 'unused' }),
      planPublish: async () => plan,
      publish: async (...args) => { published.push(args); return { ok: true } },
    }
    const d = door(new UiChannel(), { pluginShare: share })
    const answer = await d.run('plugin-publish', { name: 'hello', confirm: plan, yes: true }, never)
    expect(answer.value).toEqual(plan)
    expect(answer.text).toContain('Publish to inboxxobni/hello (a new repository), public, version 0.1.0, license MIT.')
    expect(answer.text).toContain('Only a person can say yes')
    expect(answer.text).toContain(plan.pullLine)
    expect(published).toEqual([])
    await d.publishConfirmed('hello', plan, { owner: 'inboxxobni' })
    expect(published).toEqual([['hello', plan, { owner: 'inboxxobni' }]])
  })
})
