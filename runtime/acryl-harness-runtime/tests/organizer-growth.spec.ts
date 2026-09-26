/**
 * The first use case of the framework (spec 036): start from the Blank Blueprint, grow a to-do list, calendar and meeting
 * organizer as one local Cordis plugin with live reload, use it through the real tool runtime, capture the result as a Blend,
 * and re-create it on a fresh app from that capture alone. No model is involved: the plugin is the one the agent would write.
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

const organizer = new URL('../../../examples/acryl-organizer/', import.meta.url).pathname
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
      const result = await tools.execute({ callId: `organizer-${String(++call)}`, name, arguments: args, agent, signal: new AbortController().signal })
      return { isError: result.isError === true, text: (result.content ?? []).map(block => block.text ?? '').join('') }
    },
  }
}

async function scratch(label: string): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), `acryl-organizer-${label}-`))
  temporary.push(path)
  return path
}

describe('grow an organizer from the Blank Blueprint', () => {
  it('builds it live, uses it, captures it as a Blend, and re-creates it on a fresh app', async () => {
    process.env.ACRYL_BLUEPRINT = 'acryl.blank'

    // App A: blank, then the organizer, live.
    const homeA = await scratch('home-a'); const wsA = await scratch('ws-a')
    process.env.DSH_HOME = homeA
    cpSync(organizer, join(wsA, '.acryl-extensions', 'acryl-organizer'), { recursive: true, filter: source => !source.includes('/tests') })
    let host: Host = await boot()
    let s = await session(host, 'organizer-a', wsA)
    try {
      const before = (await host.ctx.get('systemPrompt')!.assemble()).tools.map(tool => tool.name)
      expect(before).not.toContain('todo_add')
      expect((await s.run('/reload new'))?.text).toContain('installed (new)')
      const after = (await host.ctx.get('systemPrompt')!.assemble()).tools.map(tool => tool.name)
      expect(after).toEqual(expect.arrayContaining(['todo_add', 'todo_list', 'todo_done', 'meeting_book', 'meeting_cancel', 'calendar_agenda', 'calendar_free_slots']))

      // Use it as the agent would on the user's behalf.
      expect((await s.tool('todo_add', { title: 'Prepare the quarterly review', due: '2026-10-01' })).text).toContain('Added #1')
      expect((await s.tool('meeting_book', { title: 'Design sync', start: '2026-10-01T14:00:00Z', minutes: 60, with: 'Sam' })).text).toContain('Booked #2')
      const clash = await s.tool('meeting_book', { title: 'Overlap', start: '2026-10-01T14:30:00Z' })
      expect(clash.isError).toBe(true)
      expect(clash.text).toContain('overlaps meeting 2')
      const agenda = (await s.tool('calendar_agenda', { day: '2026-10-01' })).text
      expect(agenda).toContain('Design sync'); expect(agenda).toContain('Prepare the quarterly review')
      expect((await s.tool('calendar_free_slots', { day: '2026-10-01', minutes: 60 })).text).toContain('2026-10-01T15:00:00.000Z to 2026-10-01T17:00:00.000Z')
      expect((await s.tool('todo_done', { id: 1 })).text).toContain('Done')
      expect((await s.tool('todo_list', {})).text).toBe('(none)')
      // The data is a plain file in the project.
      expect(JSON.parse(readFileSync(join(wsA, '.acryl', 'organizer.json'), 'utf8')).meetings).toHaveLength(1)

      const snapshot = await s.run('/blend snapshot')
      expect(snapshot?.kind, String(snapshot?.text)).toBe('success')
      expect(snapshot?.text).toContain('1 local extension(s) vendored')
    } finally { await s.bridge.dispose(); await host.dispose() }

    // App B: a different home, a different workspace, only the captured directory (and the data file, which is project data).
    const homeB = await scratch('home-b'); const wsB = await scratch('ws-b')
    process.env.DSH_HOME = homeB
    cpSync(join(wsA, '.acryl', 'blend'), join(wsB, '.acryl', 'blend'), { recursive: true })
    cpSync(join(wsA, '.acryl', 'organizer.json'), join(wsB, '.acryl', 'organizer.json'))
    host = await boot()
    s = await session(host, 'organizer-b', wsB)
    try {
      expect((await host.ctx.get('systemPrompt')!.assemble()).tools.map(tool => tool.name)).not.toContain('meeting_book')
      const applied = await s.run('/blend apply')
      expect(applied?.kind, String(applied?.text)).toBe('success')
      expect(existsSync(join(wsB, '.acryl-extensions', 'acryl-organizer', 'index.js'))).toBe(true)
      expect((await host.ctx.get('systemPrompt')!.assemble()).tools.map(tool => tool.name)).toContain('meeting_book')
      // Restored, and it remembers what the project already held.
      expect((await s.tool('calendar_agenda', { day: '2026-10-01' })).text).toContain('Design sync')
      expect((await s.tool('meeting_book', { title: 'Overlap again', start: '2026-10-01T14:15:00Z' })).isError).toBe(true)
    } finally { await s.bridge.dispose(); await host.dispose() }
  }, 300_000)
})
