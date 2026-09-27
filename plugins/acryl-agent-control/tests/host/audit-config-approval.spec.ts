import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'
import { createApprovalPolicy } from '../../src/host/approval.ts'
import { AuditLog, defaultAuditPath, type AuditEntry } from '../../src/host/audit.ts'
import { parseConfig } from '../../src/host/config.ts'
import { describeCall, RefDirectory, TOOL_NAMES } from '../../src/host/tools.ts'

const dir = mkdtempSync(join(tmpdir(), 'acryl-ui-audit-'))
afterAll(() => { rmSync(dir, { recursive: true, force: true }) })

const entry = (tool: string, outcome: AuditEntry['outcome'] = 'ok'): AuditEntry => ({ at: '2026-09-27T10:00:00.000Z', tool, outcome, approval: 'asked' })

describe('AuditLog', () => {
  it('appends one JSON line per call, privately, and reads the most recent back', () => {
    const path = join(dir, 'nested', 'ui-control.jsonl')
    const log = new AuditLog(path)
    for (let i = 0; i < 5; i += 1) log.record(entry(`tool-${String(i)}`))
    expect(readFileSync(path, 'utf8').trim().split('\n')).toHaveLength(5)
    expect(statSync(path).mode & 0o077).toBe(0)
    expect(log.recent(2).map(e => e.tool)).toEqual(['tool-3', 'tool-4'])
  })

  it('never throws when the disk refuses, and skips a damaged line when reading', () => {
    const blocked = new AuditLog(join(dir, 'a-file', 'x.jsonl'))
    writeFileSync(join(dir, 'a-file'), 'in the way')
    expect(() => { blocked.record(entry('t')) }).not.toThrow()
    const path = join(dir, 'damaged.jsonl')
    writeFileSync(path, `${JSON.stringify(entry('good'))}\n{broken\n${JSON.stringify(entry('also-good'))}\n`)
    expect(new AuditLog(path).recent().map(e => e.tool)).toEqual(['good', 'also-good'])
    expect(new AuditLog(join(dir, 'missing.jsonl')).recent()).toEqual([])
  })

  it('rotates a log that grew too large instead of growing forever', () => {
    const path = join(dir, 'big.jsonl')
    writeFileSync(path, 'x'.repeat(5 * 1024 * 1024 + 1))
    new AuditLog(path).record(entry('after-rotation'))
    expect(existsSync(`${path}.1`)).toBe(true)
    expect(readFileSync(path, 'utf8')).toContain('after-rotation')
  })

  it('lives in the ACRYL home', () => {
    expect(defaultAuditPath({ ACRYL_HOME: '/data/acryl' })).toBe('/data/acryl/audit/ui-control.jsonl')
    expect(defaultAuditPath({})).toMatch(/\.acryl\/audit\/ui-control\.jsonl$/)
  })
})

describe('parseConfig', () => {
  it('asks about every call unless told otherwise', () => {
    expect(parseConfig(undefined)).toEqual({ approval: 'every-call' })
    expect(parseConfig({})).toEqual({ approval: 'every-call' })
    expect(parseConfig({ approval: 'none', auditLog: '/tmp/x.jsonl' })).toEqual({ approval: 'none', auditLog: '/tmp/x.jsonl' })
  })
  it('refuses anything it does not understand rather than loosening', () => {
    for (const bad of ['yes', [], { approval: 'sometimes' }, { approval: true }, { extra: 1 }, { auditLog: '' }, { auditLog: 3 }]) {
      expect(() => parseConfig(bad)).toThrow(/acryl-agent-control/)
    }
  })
})

describe('approval policy', () => {
  const refs = new RefDirectory()
  refs.remember({ generation: 3, title: '', total: 2, nodes: [{ ref: '3.1', role: 'button', name: 'Delete project', depth: 0, states: [] }, { ref: '3.2', role: 'textbox', name: 'Name', depth: 0, states: [] }] })
  const exec = (name: string, args: unknown): ToolExecution => ({ name, arguments: args } as unknown as ToolExecution)
  const allow = async (): Promise<PreToolDecision> => ({ kind: 'allow' })

  it('asks about a click, in words that name the control, every single time', async () => {
    const policy = createApprovalPolicy(refs, 'every-call')
    for (let i = 0; i < 3; i += 1) {
      expect(await policy(exec(TOOL_NAMES.click, { ref: '3.1' }), allow)).toEqual({ kind: 'ask', reason: 'Click the button "Delete project"' })
    }
    expect(await policy(exec(TOOL_NAMES.type, { ref: '3.2', text: 'acryl', submit: true }), allow)).toEqual({ kind: 'ask', reason: 'Type "acryl" into the textbox "Name" and press Enter' })
    expect(await policy(exec(TOOL_NAMES.press, { key: 'Enter' }), allow)).toEqual({ kind: 'ask', reason: 'Press Enter on the focused control' })
    expect(await policy(exec(TOOL_NAMES.select, { ref: '9.9', option: 'pro' }), allow)).toEqual({ kind: 'ask', reason: 'Choose "pro" in the control 9.9' })
  })

  it('does not ask about looking, scrolling or waiting', async () => {
    const policy = createApprovalPolicy(refs, 'every-call')
    for (const name of [TOOL_NAMES.snapshot, TOOL_NAMES.scroll, TOOL_NAMES.wait]) expect(await policy(exec(name, {}), allow)).toEqual({ kind: 'allow' })
  })

  it('leaves other tools alone, and lets another plugin’s denial win', async () => {
    const policy = createApprovalPolicy(refs, 'every-call')
    expect(await policy(exec('bash', { command: 'ls' }), allow)).toEqual({ kind: 'allow' })
    expect(await policy(exec(TOOL_NAMES.click, { ref: '3.1' }), async () => ({ kind: 'deny', reason: 'plan mode' }))).toEqual({ kind: 'deny', reason: 'plan mode' })
  })

  it('asks nothing when approval was explicitly switched off', async () => {
    expect(await createApprovalPolicy(refs, 'none')(exec(TOOL_NAMES.click, { ref: '3.1' }), allow)).toEqual({ kind: 'allow' })
  })

  it('shortens long text in the prompt and forgets refs from an older snapshot', () => {
    const long = describeCall(TOOL_NAMES.type, { ref: '3.2', text: 'x'.repeat(200) }, refs)
    expect(long.length).toBeLessThan(120)
    refs.remember({ generation: 4, title: '', total: 1, nodes: [{ ref: '4.1', role: 'button', name: 'Other', depth: 0, states: [] }] })
    expect(refs.describe('3.1')).toBe('the control 3.1')
    expect(refs.describe('4.1')).toBe('the button "Other"')
    expect(refs.describe(42)).toBe('a control')
  })
})
