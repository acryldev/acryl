/**
 * The door end to end on a real loopback server: the connection file, the operator client from the app folder, a page answering over the
 * event stream, the refusals of every other caller, and the plugin and tool verbs over optional services.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { doorFilePath, readDoorFile } from '../../src/host/door-file.ts'
import { UiDriver } from '../../src/page/driver/driver.ts'
import { appFolder, connectPage, domPage, operator, pageHeaders, removeFolders, startApp, until, type Running } from '../harness.ts'

const apps: Running[] = []
const pages: Array<{ dispose(): void }> = []
afterEach(async () => {
  for (const page of pages.splice(0)) page.dispose()
  while (apps.length > 0) await apps.pop()?.close()
  removeFolders()
})

let document: Document

async function app(options: Parameters<typeof startApp>[0] = {}): Promise<Running> {
  const running = await startApp(options)
  apps.push(running)
  return running
}

/** A page with one button that counts its clicks, connected to the app. */
async function page(running: Running) {
  const dom = domPage('<main><h1>Timer</h1><output id="count">0</output><button type="button">Start</button></main>')
  pages.push({ dispose: () => { dom.close() } })
  document = dom.document
  const button = document.querySelector('button') as HTMLButtonElement
  button.addEventListener('click', () => { (document.getElementById('count') as HTMLElement).textContent = String(Number(document.getElementById('count')?.textContent) + 1) })
  const driver = new UiDriver({ document: () => dom.document })
  const { channel, sources } = connectPage(running, driver)
  pages.push(channel, driver)
  await sources[0]?.opened
  return { driver, channel, sources }
}

describe('the door in a framework app', () => {
  it('writes .acryl/door.json for this run, private, with its own .gitignore, and removes it when the plugin stops', async () => {
    const running = await app()
    const file = readDoorFile(running.root)
    expect(file).toMatchObject({ version: 1, url: running.origin, pid: process.pid })
    expect(file?.secret).toMatch(/^[0-9a-f]{48}$/u)
    expect(readFileSync(join(running.root, '.acryl', '.gitignore'), 'utf8')).toMatch(/^\*$/mu)
    if (process.platform !== 'win32') {
      expect(statSync(doorFilePath(running.root)).mode & 0o777).toBe(0o600)
      expect(statSync(join(running.root, '.acryl')).mode & 0o777).toBe(0o700)
    }
    await running.close()
    apps.pop()
    expect(existsSync(doorFilePath(running.root))).toBe(false)
  })

  it.runIf(process.platform === 'win32')('on Windows, door.json is readable only by the user, SYSTEM and Administrators (its ACL, inherited from the profile)', async () => {
    const running = await app()
    const acl = execFileSync('icacls', [doorFilePath(running.root)], { encoding: 'utf8' })
    // icacls prints the file (in its short 8.3 form, e.g. RUNNER~1) before the first entry: everything up to `door.json` is the path.
    const grantees = acl.split(/\r?\n/u)
      .map(line => (line.includes('door.json') ? line.slice(line.indexOf('door.json') + 'door.json'.length) : line).trim())
      .filter(line => line.includes(':('))
      .map(line => line.slice(0, line.indexOf(':(')))
    // Windows' own whoami (domain\user, as icacls names it), not a Git for Windows one earlier on PATH that prints the bare user name.
    const user = execFileSync(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'whoami.exe'), { encoding: 'utf8' }).trim().toLowerCase()
    for (const grantee of grantees) {
      expect([user, 'nt authority\\system', 'builtin\\administrators'], acl).toContain(grantee.toLowerCase())
    }
    expect(grantees.map(g => g.toLowerCase())).toContain(user)
  })

  it('answers the operator from the app folder: control tool list, verbs, and brief', async () => {
    const running = await app()
    const tools = await operator(running.root, ['control', 'tool', 'list'])
    expect(tools).toMatchObject({ code: 0, err: '' })
    expect(tools.out).toMatch(/no app tools are offered/u)
    const verbs = await operator(running.root, ['verbs', '--json'])
    expect(JSON.parse(verbs.out)).toEqual(['brief', 'look', 'act', 'plugin-list', 'plugin-add', 'plugin-remove', 'plugin-reload', 'tool-list', 'tool-call'])
    writeFileSync(join(running.root, 'AGENTS.md'), '# demo\n')
    const brief = await operator(running.root, ['brief'])
    expect(brief.code).toBe(0)
    expect(brief.out).toContain(`App demo in ${running.root}.`)
    expect(brief.out).toContain('Read first: AGENTS.md.')
    expect(brief.out).toContain('Page: not open')
  })

  it('looks at the page and acts on it through the event stream, and audits each call without what was typed', async () => {
    const running = await app()
    await page(running)
    const look = await operator(running.root, ['look'])
    expect(look.code, look.err).toBe(0)
    expect(look.out).toContain('button "Start"')
    const ref = /button "Start" \[ref=([\d.]+)\]/u.exec(look.out)?.[1] as string
    const click = await operator(running.root, ['act', 'click', '--ref', ref])
    expect(click, click.err).toMatchObject({ code: 0 })
    expect(click.out).toContain('button "Start"')
    expect(document.getElementById('count')?.textContent).toBe('1')
    // The ACRYL Host form reaches the same verbs.
    const again = await operator(running.root, ['control', 'click', '--ref', ref])
    expect(again.code).toBe(0)
    expect(document.getElementById('count')?.textContent).toBe('2')
    const audit = readFileSync(join(running.root, '.acryl', 'audit', 'ui-control.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line) as { tool: string; outcome: string; approval: string })
    expect(audit.map(entry => [entry.tool, entry.outcome, entry.approval])).toEqual([['look', 'ok', 'token'], ['act click', 'ok', 'token'], ['act click', 'ok', 'token']])
  })

  it('lets the agent read a value off the page as written, with no markup added for it, and see it change after an act (slice 12)', async () => {
    const running = await app()
    await page(running)
    // A value in a plain element, as an app writes it: no role, no label, no test id.
    document.querySelector('main')?.insertAdjacentHTML('beforeend', '<p>Time left: <span id="left">25:00</span></p>')
    const button = document.querySelector('button') as HTMLButtonElement
    button.addEventListener('click', () => { (document.getElementById('left') as HTMLElement).textContent = '24:59' })
    const before = await operator(running.root, ['look'])
    expect(before.code, before.err).toBe(0)
    expect(before.out).toMatch(/- text "Time left:" \[ref=[\d.]+\]\n\s*- text "25:00" \[ref=/u)
    const ref = /button "Start" \[ref=([\d.]+)\]/u.exec(before.out)?.[1] as string
    expect((await operator(running.root, ['act', 'click', '--ref', ref])).code).toBe(0)
    const after = await operator(running.root, ['look', '--json'])
    const nodes = (JSON.parse(after.out) as { nodes: Array<{ role: string; name: string }> }).nodes
    expect(nodes.filter(node => node.role === 'text').map(node => node.name)).toContain('24:59')
  })

  it('settles a call in flight as disconnected when the page drops, and a page that comes back answers the next call', async () => {
    const running = await app()
    const { sources } = await page(running)
    const waiting = operator(running.root, ['act', 'wait', '--text', 'never shown', '--timeout-ms', '9000'])
    await until(() => sources.length === 1)
    await new Promise(resolve => setTimeout(resolve, 100))
    const started = Date.now()
    sources[0]?.close()
    const dropped = await waiting
    expect(dropped.code).toBe(1)
    expect(dropped.err).toMatch(/^disconnected:/u)
    expect(Date.now() - started).toBeLessThan(2000)
    // The channel opens a new stream with the same window id after its backoff.
    await until(() => sources.length === 2, 'the page to reconnect')
    await sources[1]?.opened
    const look = await operator(running.root, ['look'])
    expect(look.code, look.err).toBe(0)
  })

  it('refuses the page channel to another origin, another loopback port and a caller with no browser headers', async () => {
    const running = await app()
    const port = Number(new URL(running.origin).port)
    const stream = `${running.origin}/api/acryl-door/channel?window=w1&focused=1`
    const otherPort = `http://127.0.0.1:${String(port + 1)}`
    const cases: Array<[string, Record<string, string>]> = [
      ['another site', { origin: 'https://evil.example', referer: 'https://evil.example/', 'sec-fetch-site': 'cross-site' }],
      ['another loopback port', { origin: otherPort, referer: `${otherPort}/`, 'sec-fetch-site': 'same-site' }],
      ['another loopback port claiming same-origin', { referer: `${otherPort}/`, 'sec-fetch-site': 'same-origin' }],
      ['no browser headers (a script on the machine)', {}],
    ]
    for (const [name, headers] of cases) {
      const response = await fetch(stream, { headers })
      expect(response.status, name).toBe(403)
      await response.body?.cancel()
    }
    const answer = await fetch(`${running.origin}/api/acryl-door/channel/answer`, {
      method: 'POST',
      headers: { origin: otherPort, 'content-type': 'application/json' },
      body: JSON.stringify({ window: 'w1', message: { t: 'focus', focused: true } }),
    })
    expect(answer.status).toBe(403)
    // The page's own headers are accepted.
    const own = await fetch(stream, { headers: pageHeaders(running.origin) })
    expect(own.status).toBe(200)
    await own.body?.cancel()
  })

  it('refuses the operator routes without this run\'s secret', async () => {
    const running = await app()
    const call = (authorization?: string) => fetch(`${running.origin}/api/acryl-door/call`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(authorization === undefined ? {} : { authorization }) },
      body: JSON.stringify({ verb: 'brief' }),
    })
    expect((await call()).status).toBe(403)
    expect((await call('Bearer nope')).status).toBe(403)
    expect((await call(`Bearer ${readDoorFile(running.root)?.secret ?? ''}`)).status).toBe(200)
  })

  it('reports no running app when the folder has no door, and never reaches another folder\'s app', async () => {
    const running = await app()
    const other = appFolder()
    const result = await operator(other, ['look'])
    expect(result.code).toBe(3)
    expect(result.err).toMatch(/no running app/u)
    expect(running.root).not.toBe(other)
  })

  it('installs, lists, reloads and removes plugins through the extensions service, only from inside the app', async () => {
    const calls: string[] = []
    const extensions = {
      install: async (source: string) => { calls.push(`install ${source}`); return { ok: true, name: 'pomodoro', action: 'installed', state: 'active', missing: [], version: '0.1.0' } },
      remove: async (name: string) => { calls.push(`remove ${name}`); return { ok: true } },
      reload: async () => { calls.push('reload'); return [] },
      list: () => [{ name: 'pomodoro', state: 'active' }],
    }
    const running = await app({ services: { extensions } })
    const added = await operator(running.root, ['plugin', 'add', 'plugins/pomodoro', '--json'])
    expect(added.code, added.err).toBe(0)
    expect(JSON.parse(added.out)).toMatchObject({ ok: true, name: 'pomodoro', state: 'active' })
    expect((await operator(running.root, ['plugin', 'list', '--json'])).out).toContain('pomodoro')
    expect((await operator(running.root, ['plugin', 'reload'])).code).toBe(0)
    expect((await operator(running.root, ['plugin', 'remove', 'pomodoro'])).code).toBe(0)
    const outside = await operator(running.root, ['plugin', 'add', '../elsewhere'])
    expect(outside.code).toBe(1)
    expect(outside.err).toMatch(/^outside-app:/u)
    expect(calls).toEqual([`install ${join(running.root, 'plugins', 'pomodoro')}`, 'reload', 'remove pomodoro'])
  })

  it('says plugins are unavailable without the extensions service', async () => {
    const running = await app()
    const result = await operator(running.root, ['plugin', 'list'])
    expect(result.code).toBe(1)
    expect(result.err).toMatch(/^unavailable:/u)
  })

  it('offers only the app tools on its allowlist', async () => {
    const tools = {
      list: () => [{ name: 'add', description: 'adds two numbers' }, { name: 'shell', description: 'runs a command' }],
      call: async (name: string, input: unknown) => (name === 'add' ? (input as { a: number; b: number }).a + (input as { a: number; b: number }).b : 'ran'),
    }
    const running = await app({ services: { tools }, config: { tools: { expose: ['add'] } } })
    const listed = await operator(running.root, ['tool', 'list'])
    expect(listed.out.trim()).toBe('add: adds two numbers')
    const sum = await operator(running.root, ['tool', 'call', '--tool', 'add', '--args', '{"a":2,"b":3}', '--json'])
    expect(sum).toMatchObject({ code: 0, out: '5\n' })
    const refused = await operator(running.root, ['tool', 'call', '--tool', 'shell'])
    expect(refused.code).toBe(1)
    expect(refused.err).toMatch(/^not-exposed:/u)
  })
})
