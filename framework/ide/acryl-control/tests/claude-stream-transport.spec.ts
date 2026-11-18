/**
 * The Claude Code stream-json transport (T048), driven through the real `acrAgentControl` service and the real `claude` provider plugin on a
 * real Cordis Context. The process on the other end is a small fake that speaks the observed protocol (the real binary is exercised by the
 * gated live test below), so these run anywhere.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { AcrAgentControlError, AcrAgentControlService, claudeProvider, createClaudeStreamTransport, type AcrAgentControl } from '../src/index.ts'

const folders: string[] = []
const contexts: Context[] = []

afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()?.fiber.dispose()
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

/** Speaks what Claude Code 2.1.288 speaks: silent until the first user message, noise lines, init, assistant, result. */
const FAKE = String.raw`
const readline = require('node:readline')
const session = 'fake-session-1'
let pendingSlow = false
const emit = (event) => process.stdout.write(JSON.stringify(event) + '\n')
process.stdout.write('[diagnostic] not a protocol line\n')
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const message = JSON.parse(line)
  if (message.type === 'control_request' && message.request.subtype === 'interrupt') {
    if (pendingSlow) { pendingSlow = false; emit({ type: 'result', subtype: 'error_during_execution', is_error: true, result: '', session_id: session, stop_reason: null }) }
    return
  }
  const text = message.message.content[0].text
  emit({ type: 'system', subtype: 'hook_started', hook_name: 'SessionStart:startup', session_id: session })
  emit({ type: 'system', subtype: 'init', session_id: session })
  if (text === 'CRASH') process.exit(3)
  if (text === 'SLOW') { pendingSlow = true; return }
  emit({ type: 'assistant', session_id: session, message: { content: [{ type: 'text', text: 'echo: ' + text }] } })
  emit({ type: 'rate_limit_event', session_id: session })
  emit({ type: 'result', subtype: 'success', is_error: false, result: 'echo: ' + text, session_id: session, stop_reason: 'end_turn' })
})
`

function fakeClaudeTransport() {
  const dir = mkdtempSync(join(tmpdir(), 'acryl-fake-claude-'))
  folders.push(dir)
  const script = join(dir, 'fake-claude.cjs')
  writeFileSync(script, FAKE)
  const seen: string[][] = []
  const transport = createClaudeStreamTransport({
    spawn: (_command, args, options) => { seen.push([...args]); return spawn(process.execPath, [script], options) },
    stopGraceMs: 1000,
    interruptGraceMs: 1500,
  })
  return { transport, seen, cwd: dir }
}

async function mount(transport: ReturnType<typeof createClaudeStreamTransport>): Promise<{ ctx: Context, control: AcrAgentControl }> {
  const ctx = new Context()
  contexts.push(ctx)
  ctx.plugin(AcrAgentControlService)
  ctx.plugin(claudeProvider(transport))
  await new Promise(resolve => setTimeout(resolve, 0))
  return { ctx, control: ctx.acrAgentControl }
}

const attachRequest = (cwd: string, extra: Record<string, unknown> = {}) => ({
  workerId: 'w1', providerId: 'claude', workspace: { identity: 'project', cwd },
  capabilities: ['agent.start', 'agent.send', 'agent.cancel', 'agent.stop'] as const, fidelity: 'structured' as const, ...extra,
})

describe('Claude Code stream-json transport', () => {
  it('binds a live runtime on attach and answers a send, then a second turn in the same process', async () => {
    const { transport, seen, cwd } = fakeClaudeTransport()
    const { control } = await mount(transport)
    const binding = await control.attach(attachRequest(cwd))
    expect(binding.runtimeId).toMatch(/^claude-\d+$/u)
    expect(seen[0]).toEqual(expect.arrayContaining(['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose']))

    const first = await control.dispatch('w1', { kind: 'send', payload: 'ping' })
    expect(first).toMatchObject({ accepted: true, kind: 'send', runtimeId: binding.runtimeId, result: { text: 'echo: ping', isError: false, sessionId: 'fake-session-1', stopReason: 'end_turn', assistantText: ['echo: ping'] } })
    const second = await control.dispatch('w1', { kind: 'send', payload: { text: 'again' } })
    expect(second.result).toMatchObject({ text: 'echo: again' })
    expect(seen).toHaveLength(1)   // one process served both turns
    await control.dispatch('w1', { kind: 'stop', payload: null })
  })

  it('refuses a second send while one is being answered, and an empty one', async () => {
    const { transport, cwd } = fakeClaudeTransport()
    const { control } = await mount(transport)
    await control.attach(attachRequest(cwd))
    const slow = control.dispatch('w1', { kind: 'send', payload: 'SLOW' })
    await new Promise(resolve => setTimeout(resolve, 100))
    await expect(control.dispatch('w1', { kind: 'send', payload: 'second' })).rejects.toMatchObject({ code: 'worker-busy' })
    await expect(control.dispatch('w1', { kind: 'send', payload: '' })).rejects.toMatchObject({ code: 'capability-rejected' })
    await control.dispatch('w1', { kind: 'cancel', payload: null })
    await slow
    await control.dispatch('w1', { kind: 'stop', payload: null })
  })

  it('cancels a running turn by interrupt, and an aborted signal does the same and reports cancelled', async () => {
    const { transport, cwd } = fakeClaudeTransport()
    const { control } = await mount(transport)
    await control.attach(attachRequest(cwd))

    const interrupted = control.dispatch('w1', { kind: 'send', payload: 'SLOW' })
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(await control.dispatch('w1', { kind: 'cancel', payload: null })).toMatchObject({ result: { interrupted: true } })
    expect((await interrupted).result).toMatchObject({ isError: true })

    const abort = new AbortController()
    const aborted = control.dispatch('w1', { kind: 'send', payload: 'SLOW' }, abort.signal)
    const rejection = expect(aborted).rejects.toBeInstanceOf(AcrAgentControlError)
    await new Promise(resolve => setTimeout(resolve, 100))
    abort.abort()
    await rejection
    await expect(aborted).rejects.toMatchObject({ code: 'cancelled' })
    // The process survived the interrupt and answers the next turn.
    expect((await control.dispatch('w1', { kind: 'send', payload: 'after' })).result).toMatchObject({ text: 'echo: after' })
    await control.dispatch('w1', { kind: 'stop', payload: null })
  })

  it('fails the turn, not the host, when the process dies mid-turn, and stop ends the process', async () => {
    const { transport, cwd } = fakeClaudeTransport()
    const { control } = await mount(transport)
    await control.attach(attachRequest(cwd))
    await expect(control.dispatch('w1', { kind: 'send', payload: 'CRASH' })).rejects.toMatchObject({ code: 'transport-unavailable' })
    await expect(control.dispatch('w1', { kind: 'send', payload: 'next' })).rejects.toMatchObject({ code: 'transport-unavailable' })

    await control.attach({ ...attachRequest(cwd), workerId: 'w2' })
    await control.dispatch('w2', { kind: 'send', payload: 'hi' })
    expect(await control.dispatch('w2', { kind: 'stop', payload: null })).toMatchObject({ result: { stopped: true } })
    await expect(control.dispatch('w2', { kind: 'send', payload: 'late' })).rejects.toMatchObject({ code: 'transport-unavailable' })
  })

  it('names a missing executable instead of crashing, and resumes by session id', async () => {
    const missing = createClaudeStreamTransport({ command: '/definitely/not/claude' })
    const { control } = await mount(missing)
    await expect(control.attach(attachRequest(tmpdir()))).rejects.toMatchObject({ code: 'transport-unavailable' })

    const { transport, seen, cwd } = fakeClaudeTransport()
    const mounted = await mount(transport)
    await mounted.control.attach(attachRequest(cwd, { providerSessionRef: 'earlier-session' }))
    expect(seen[0]).toEqual(expect.arrayContaining(['--resume', 'earlier-session']))
    await mounted.control.dispatch('w1', { kind: 'stop', payload: null })
  })

  it('ends every process when the plugin that owns the transport unloads', async () => {
    const { transport, cwd } = fakeClaudeTransport()
    const { ctx, control } = await mount(transport)
    const binding = await control.attach(attachRequest(cwd))
    const pid = Number(String(binding.runtimeId).replace('claude-', ''))
    expect(() => process.kill(pid, 0)).not.toThrow()
    await ctx.fiber.dispose()
    contexts.pop()
    await new Promise(resolve => setTimeout(resolve, 1500))
    expect(() => process.kill(pid, 0)).toThrow()
  })
})

// The real binary, on the real protocol. Off by default (it uses the owner's Claude login and one short turn); run with ACRYL_LIVE_CLAUDE=1.
describe.skipIf(process.env.ACRYL_LIVE_CLAUDE === undefined)('Claude Code, for real', () => {
  it('answers a turn through acrAgentControl', async () => {
    const transport = createClaudeStreamTransport({ args: ['--no-session-persistence', '--tools', ''] })
    const { control } = await mount(transport)
    const dir = mkdtempSync(join(tmpdir(), 'acryl-live-claude-'))
    folders.push(dir)
    await control.attach(attachRequest(dir))
    const receipt = await control.dispatch('w1', { kind: 'send', payload: 'Reply with exactly the single word: pong' })
    expect(receipt.result).toMatchObject({ isError: false })
    expect(String((receipt.result as { text: string }).text).toLowerCase()).toContain('pong')
    expect((receipt.result as { sessionId: string | null }).sessionId).toMatch(/[0-9a-f-]{36}/u)
    await control.dispatch('w1', { kind: 'stop', payload: null })
  }, 120_000)

  it('interrupts a long answer with the real control request, and the same process answers the next turn', async () => {
    const transport = createClaudeStreamTransport({ args: ['--no-session-persistence', '--tools', ''], interruptGraceMs: 20_000 })
    const { control } = await mount(transport)
    const dir = mkdtempSync(join(tmpdir(), 'acryl-live-claude-'))
    folders.push(dir)
    await control.attach(attachRequest(dir))
    const long = control.dispatch('w1', { kind: 'send', payload: 'Write the numbers from 1 to 2000, one per line, with no other text.' })
    await new Promise(resolve => setTimeout(resolve, 4000))
    expect(await control.dispatch('w1', { kind: 'cancel', payload: null })).toMatchObject({ result: { interrupted: true } })
    const ended = (await long).result as { text: string, assistantText: string[] }
    expect(ended.assistantText.join('\n').length).toBeLessThan(10_000)
    const next = await control.dispatch('w1', { kind: 'send', payload: 'Reply with exactly the single word: pong' })
    expect(String((next.result as { text: string }).text).toLowerCase()).toContain('pong')
    await control.dispatch('w1', { kind: 'stop', payload: null })
  }, 180_000)
})
