/**
 * `plugin publish` at the terminal: a yes publishes what was shown, anything else and any shell without a person sends nothing. The app is a stand-in
 * behind `fetch`; what is under test is who can reach the confirm route.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { main } from '../../src/cli/acryl.ts'

const plan = { owner: 'inboxxobni', repo: 'hello', version: '0.1.0', license: 'Apache-2.0' }
const folders: string[] = []
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

async function run(ask?: (question: string) => Promise<boolean>, answer: unknown = plan) {
  const cwd = mkdtempSync(join(tmpdir(), 'publish-cli-'))
  folders.push(cwd)
  mkdirSync(join(cwd, '.acryl'))
  writeFileSync(join(cwd, '.acryl', 'door.json'), JSON.stringify({ version: 1, url: 'http://door.test', secret: 's', pid: process.pid }))
  const calls: Array<{ url: string; body: { name?: string; owner?: string; confirm?: unknown } }> = []
  const fake = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init?.body)) })
    if (url.endsWith('/publish-confirmed')) {
      return Response.json({ ok: true, value: { ok: true, releaseUrl: 'https://github.com/inboxxobni/hello/releases/tag/v0.1.0', pullLine: 'the pull line' }, text: '' })
    }
    return Response.json({ ok: true, value: answer, text: 'the plan' })
  }) as unknown as typeof fetch
  let out = ''
  const code = await main(['plugin', 'publish', 'hello', '--owner', 'inboxxobni', '--license', 'Apache-2.0'], {
    cwd,
    out: (text) => { out += text },
    err: (text) => { out += text },
    fetch: fake,
    ...(ask === undefined ? {} : { ask }),
  })
  return { code, out, confirmed: calls.filter((call) => call.url.endsWith('/publish-confirmed')) }
}

describe('plugin publish at a terminal', () => {
  it('without a person (a pipe, an agent\'s shell) it shows the plan and sends nothing', async () => {
    const { code, out, confirmed } = await run()
    expect([code, confirmed]).toEqual([0, []])
    expect(out).toContain('the plan')
  })

  it('anything but yes sends nothing', async () => {
    const { code, out, confirmed } = await run(async () => false)
    expect([code, confirmed]).toEqual([0, []])
    expect(out).toContain('Nothing was sent.')
  })

  it('a yes sends the plan that was shown, names it in the question and prints the pull line', async () => {
    let asked = ''
    const { code, out, confirmed } = await run(async (question) => { asked = question; return true })
    expect(code).toBe(0)
    expect(asked).toContain('inboxxobni/hello v0.1.0 under Apache-2.0')
    expect(confirmed.map((call) => call.body)).toEqual([{ name: 'hello', owner: 'inboxxobni', license: 'Apache-2.0', confirm: plan }])
    expect(out).toContain('the pull line')
  })

  it('a refused plan is not asked about', async () => {
    let asked = false
    const { confirmed } = await run(async () => { asked = true; return true }, { ok: false, reason: 'no', next: 'no' })
    expect([asked, confirmed]).toEqual([false, []])
  })
})
