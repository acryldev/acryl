import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { afterAll, describe, expect, it } from 'vitest'
import type { UiRequest, UiResult } from '../../src/contract.ts'
import { UiControlError } from '../../src/contract.ts'
import { AuditLog } from '../../src/host/audit.ts'
import { UiChannel } from '../../src/host/channel.ts'
import { MUTATING_TOOL_NAMES, RefDirectory, registerUiTools, TOOL_NAMES } from '../../src/host/tools.ts'

const dir = mkdtempSync(join(tmpdir(), 'acryl-ui-tools-'))
afterAll(() => { rmSync(dir, { recursive: true, force: true }) })

interface Registered { name: string; description: string; execute: (args: unknown, exec: { signal: AbortSignal }) => Promise<unknown>; output: { render: (args: unknown, value: never) => Array<{ text: string }> } }

function setup(respond: (request: UiRequest) => UiResult | UiControlError) {
  const registered = new Map<string, Registered>()
  let removed = 0
  const ctx = { tools: { register: (tool: Registered) => { registered.set(tool.name, tool); return () => { registered.delete(tool.name); removed += 1 } } } } as unknown as Context
  const channel = new UiChannel()
  const calls: UiRequest[] = []
  const page = channel.attach({
    send: (data) => {
      const call = JSON.parse(data) as { id: number; request: UiRequest }
      calls.push(call.request)
      const answer = respond(call.request)
      queueMicrotask(() => {
        if (answer instanceof UiControlError) page.onMessage({ t: 'error', id: call.id, code: answer.code, message: answer.message })
        else page.onMessage({ t: 'result', id: call.id, value: answer })
      })
    },
    close() {},
  })
  page.onMessage({ t: 'hello', windowId: 'w1', focused: true })
  const audit = new AuditLog(join(dir, `${String(Math.random())}.jsonl`))
  const refs = new RefDirectory()
  const dispose = registerUiTools(ctx, { channel, audit, refs, approval: 'asked' })
  const run = (name: string, args: unknown) => registered.get(name)!.execute(args, { signal: new AbortController().signal })
  return { registered, calls, audit, refs, run, dispose, removed: () => removed }
}

describe('Agent Control tools', () => {
  it('registers exactly the seven tools and removes them all on dispose', () => {
    const t = setup(() => ({ ok: true }))
    expect([...t.registered.keys()].sort()).toEqual(Object.values(TOOL_NAMES).sort())
    t.dispose()
    expect(t.registered.size).toBe(0)
    expect(t.removed()).toBe(7)
  })

  it('marks exactly click, type, select and press as mutating', () => {
    expect([...MUTATING_TOOL_NAMES].sort()).toEqual([TOOL_NAMES.click, TOOL_NAMES.press, TOOL_NAMES.select, TOOL_NAMES.type].sort())
  })

  it('snapshots through the page, remembers what each ref means, and renders text for the model', async () => {
    const t = setup(() => ({ generation: 2, title: 'ACRYL', total: 1, nodes: [{ ref: '2.1', role: 'button', name: 'Add project', depth: 0, states: [] }] }))
    const value = await t.run(TOOL_NAMES.snapshot, {})
    expect(value).toMatchObject({ generation: 2, nodes: [{ ref: '2.1', name: 'Add project' }] })
    expect(t.refs.describe('2.1')).toBe('the button "Add project"')
    expect(t.registered.get(TOOL_NAMES.snapshot)!.output.render({}, value as never)[0]!.text).toContain('- button "Add project" [ref=2.1]')
    expect(t.audit.recent().map(e => [e.tool, e.outcome, e.approval])).toEqual([[TOOL_NAMES.snapshot, 'ok', 'not-needed']])
  })

  it('performs a click and audits the control touched, never the text typed', async () => {
    const t = setup(request => ({ ok: true, target: { role: request.op === 'type' ? 'textbox' : 'button', name: 'Field' }, detail: 'typed 6 characters' }))
    await t.run(TOOL_NAMES.click, { ref: '1.1' })
    await t.run(TOOL_NAMES.type, { ref: '1.2', text: 'hunter2' })
    expect(t.calls).toEqual([{ op: 'click', ref: '1.1' }, { op: 'type', ref: '1.2', text: 'hunter2' }])
    const log = JSON.stringify(t.audit.recent())
    expect(log).not.toContain('hunter2')
    expect(t.audit.recent().map(e => [e.tool, e.target?.name, e.approval])).toEqual([[TOOL_NAMES.click, 'Field', 'asked'], [TOOL_NAMES.type, 'Field', 'asked']])
  })

  it('turns a refusal into an error the model can read, and audits it as refused', async () => {
    const t = setup(() => new UiControlError('protected', 'that belongs to Agent Control itself'))
    await expect(t.run(TOOL_NAMES.click, { ref: '1.1' })).rejects.toThrow('protected: that belongs to Agent Control itself')
    expect(t.audit.recent()).toMatchObject([{ tool: TOOL_NAMES.click, outcome: 'refused', detail: 'protected' }])
  })

  it('refuses malformed arguments before they reach the page', async () => {
    const t = setup(() => ({ ok: true }))
    await expect(t.run(TOOL_NAMES.click, { ref: 'button' })).rejects.toThrow('invalid')
    await expect(t.run(TOOL_NAMES.click, { ref: '1.1', force: true })).rejects.toThrow('invalid')
    await expect(t.run(TOOL_NAMES.press, { key: 'Control+Alt+Delete' })).rejects.toThrow('invalid')
    expect(t.calls).toEqual([])
    expect(t.audit.recent().every(e => e.outcome === 'refused')).toBe(true)
  })

  it('reports a missing window as a failure, not a refusal', async () => {
    const registered = new Map<string, Registered>()
    const ctx = { tools: { register: (tool: Registered) => { registered.set(tool.name, tool); return () => {} } } } as unknown as Context
    const audit = new AuditLog(join(dir, 'nowindow.jsonl'))
    registerUiTools(ctx, { channel: new UiChannel(), audit, refs: new RefDirectory(), approval: 'none' })
    await expect(registered.get(TOOL_NAMES.snapshot)!.execute({}, { signal: new AbortController().signal })).rejects.toThrow('no-window')
    expect(audit.recent()).toMatchObject([{ outcome: 'failed', detail: 'no-window' }])
  })

  it('records that approval was off when it is', async () => {
    const registered = new Map<string, Registered>()
    const ctx = { tools: { register: (tool: Registered) => { registered.set(tool.name, tool); return () => {} } } } as unknown as Context
    const channel = new UiChannel()
    const page = channel.attach({ send: (data) => { page.onMessage({ t: 'result', id: (JSON.parse(data) as { id: number }).id, value: { ok: true } }) }, close() {} })
    page.onMessage({ t: 'hello', windowId: 'w', focused: true })
    const audit = new AuditLog(join(dir, 'none.jsonl'))
    registerUiTools(ctx, { channel, audit, refs: new RefDirectory(), approval: 'none' })
    await registered.get(TOOL_NAMES.click)!.execute({ ref: '1.1' }, { signal: new AbortController().signal })
    expect(audit.recent()[0]?.approval).toBe('none')
  })
})
