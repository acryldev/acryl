/**
 * The second use case of the framework (spec 036): start from the Blank Blueprint, grow a Getting Things Done
 * planner - inbox, triage, next actions, waiting for, someday/maybe, reference, a calendar of due dates - as one
 * local Cordis plugin with live reload, use it through the real tool runtime, capture the result as a Blend, and
 * re-create it on a fresh app from that capture alone. Same shape as organizer-growth.spec.ts.
 */
import { cpSync, existsSync, readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { SessionId } from '@deepseek-ai/dsh-session'
import { afterEach, describe, expect, it } from 'vitest'
import { createWebEngineDefinition } from '../src/engine-dsh.ts'
import { createAcrylEngineHost } from '../src/engine-host.ts'
import { createAcrylSessionBridge } from '../src/session-bridge.ts'

const gtd = new URL('../../../examples/acryl-gtd/', import.meta.url).pathname
const temporary: string[] = []
const saved = { home: process.env.DSH_HOME, blueprint: process.env.ACRYL_BLUEPRINT }

afterEach(async () => {
  if (saved.home === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = saved.home
  if (saved.blueprint === undefined) delete process.env.ACRYL_BLUEPRINT; else process.env.ACRYL_BLUEPRINT = saved.blueprint
  await Promise.all(temporary.splice(0).map(path => rm(path, { force: true, recursive: true })))
})

type Host = Awaited<ReturnType<typeof boot>>
const boot = () => createAcrylEngineHost({
  engines: [createWebEngineDefinition(new URL('../package.json', import.meta.url).href)],
  initialEngine: 'dsh',
  prepare: hostCtx => { provideCmdline(hostCtx, { args: ['--no-open', '--port', '0'], exit: () => {} }) },
})

async function session(host: Host, generationId: string, cwd: string) {
  const bridge = createAcrylSessionBridge(host.ctx, { profile: 'web', generationId, attachment: 'owner', cwd })
  const sessionId = await bridge.open()
  const agent = (host.ctx as unknown as { agents: { get(id: unknown): unknown } }).agents.get(SessionId(sessionId))
  const commands = host.ctx.get('commands' as never) as unknown as {
    execute(agent: unknown, line: string, attachments: unknown[], signal: AbortSignal): Promise<{ result: { kind: string, text?: string } } | undefined>
  }
  const tools = host.ctx.get('tools' as never) as unknown as {
    execute(input: { callId: string, name: string, arguments: unknown, agent: unknown, signal: AbortSignal }): Promise<{ isError?: boolean, content?: { type: string, text?: string }[] }>
  }
  let call = 0
  return {
    bridge,
    run: async (line: string) => (await commands.execute(agent, line, [], new AbortController().signal))?.result,
    tool: async (name: string, args: Record<string, unknown>) => {
      const result = await tools.execute({ callId: `gtd-${String(++call)}`, name, arguments: args, agent, signal: new AbortController().signal })
      return { isError: result.isError === true, text: (result.content ?? []).map(block => block.text ?? '').join('') }
    },
  }
}

async function scratch(label: string): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), `acryl-gtd-${label}-`))
  temporary.push(path)
  return path
}

describe('grow a GTD planner from the Blank Blueprint', () => {
  it('builds it live, captures everything, triages it, and re-creates it on a fresh app', async () => {
    process.env.ACRYL_BLUEPRINT = 'acryl.blank'

    // App A: blank, then the GTD plugin, live.
    const homeA = await scratch('home-a'); const wsA = await scratch('ws-a')
    process.env.DSH_HOME = homeA
    cpSync(gtd, join(wsA, '.acryl-extensions', 'acryl-gtd'), { recursive: true, filter: source => !source.includes('/tests') })
    let host: Host = await boot()
    let s = await session(host, 'gtd-a', wsA)
    try {
      const before = (await host.ctx.get('systemPrompt')!.assemble()).tools.map(tool => tool.name)
      expect(before).not.toContain('gtd_capture')
      expect((await s.run('/reload new'))?.text).toContain('installed (new)')
      const after = (await host.ctx.get('systemPrompt')!.assemble()).tools.map(tool => tool.name)
      expect(after).toEqual(expect.arrayContaining(['gtd_capture', 'gtd_inbox', 'gtd_triage', 'gtd_complete', 'gtd_next', 'gtd_waiting', 'gtd_someday', 'gtd_reference', 'gtd_projects', 'gtd_project', 'gtd_agenda', 'gtd_upcoming']))

      // Capture everything - get it out of your head.
      expect((await s.tool('gtd_capture', { title: 'Renew passport', due: '2026-10-15' })).text).toContain('Captured #1')
      expect((await s.tool('gtd_capture', { title: 'Call the dentist' })).text).toContain('Captured #2')
      expect((await s.tool('gtd_capture', { title: 'Learn to sail' })).text).toContain('Captured #3')
      expect((await s.tool('gtd_capture', { title: 'The warranty card', note: 'For the espresso machine' })).text).toContain('Captured #4')
      expect((await s.tool('gtd_inbox', {})).text.split('\n')).toHaveLength(4)

      // Triage: the one GTD decision, per item.
      expect((await s.tool('gtd_triage', { id: 1, status: 'next', project: 'Travel' })).text).toContain('#1 is now next')
      expect((await s.tool('gtd_triage', { id: 2, status: 'waiting' })).text).toContain('#2 is now waiting')
      expect((await s.tool('gtd_triage', { id: 3, status: 'someday' })).text).toContain('#3 is now someday')
      expect((await s.tool('gtd_triage', { id: 4, status: 'reference' })).text).toContain('#4 is now reference')
      expect((await s.tool('gtd_inbox', {})).text).toBe('(none)')

      expect((await s.tool('gtd_next', {})).text).toContain('Renew passport')
      expect((await s.tool('gtd_waiting', {})).text).toContain('Call the dentist')
      expect((await s.tool('gtd_someday', {})).text).toContain('Learn to sail')
      expect((await s.tool('gtd_reference', {})).text).toContain('warranty card')
      expect((await s.tool('gtd_projects', {})).text).toContain('Travel: 1 open, 0 done')
      expect((await s.tool('gtd_agenda', { day: '2026-10-15' })).text).toContain('Renew passport')
      expect((await s.tool('gtd_complete', { id: 1 })).text).toContain('Done: #1')
      expect((await s.tool('gtd_next', {})).text).toBe('(none)')
      expect((await s.tool('gtd_projects', {})).text).toContain('Travel: 0 open, 1 done')

      // The data is a plain file in the project.
      const data = JSON.parse(readFileSync(join(wsA, '.acryl', 'gtd.json'), 'utf8'))
      expect(data.items).toHaveLength(4)

      const snapshot = await s.run('/blend snapshot')
      expect(snapshot?.kind, String(snapshot?.text)).toBe('success')
      expect(snapshot?.text).toContain('1 local extension(s) vendored')
    } finally { await s.bridge.dispose(); await host.dispose() }

    // App B: a different home, a different workspace, only the captured directory (and the data file, which is project data).
    const homeB = await scratch('home-b'); const wsB = await scratch('ws-b')
    process.env.DSH_HOME = homeB
    cpSync(join(wsA, '.acryl', 'blend'), join(wsB, '.acryl', 'blend'), { recursive: true })
    cpSync(join(wsA, '.acryl', 'gtd.json'), join(wsB, '.acryl', 'gtd.json'))
    host = await boot()
    s = await session(host, 'gtd-b', wsB)
    try {
      expect((await host.ctx.get('systemPrompt')!.assemble()).tools.map(tool => tool.name)).not.toContain('gtd_capture')
      const applied = await s.run('/blend apply')
      expect(applied?.kind, String(applied?.text)).toBe('success')
      expect(existsSync(join(wsB, '.acryl-extensions', 'acryl-gtd', 'index.js'))).toBe(true)
      expect((await host.ctx.get('systemPrompt')!.assemble()).tools.map(tool => tool.name)).toContain('gtd_capture')
      // Restored, and it remembers what the project already held.
      expect((await s.tool('gtd_waiting', {})).text).toContain('Call the dentist')
      expect((await s.tool('gtd_projects', {})).text).toContain('Travel: 0 open, 1 done')
    } finally { await s.bridge.dispose(); await host.dispose() }
  }, 300_000)
})
