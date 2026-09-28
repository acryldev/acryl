import { describe, expect, it, vi } from 'vitest'
import type { RunningApp } from 'acryl-harness-runtime'
import { UiControlError, type UiResult } from 'acryl-agent-control'
import { buildRequest, runControlCommand } from '../src/host/control-command.ts'
import type { AcrylControlInvocation } from '../src/cli/grammar.ts'

const base = { kind: 'control' as const, json: false, version: false, help: false }
const invocation = (patch: Partial<AcrylControlInvocation>): AcrylControlInvocation => ({ ...base, action: 'snapshot', ...patch })

describe('buildRequest (spec 041 TB31: what an `acryl control` invocation asks the app to do)', () => {
  it('builds a snapshot request, with or without paging', () => {
    expect(buildRequest(invocation({ action: 'snapshot' }))).toEqual({ op: 'snapshot' })
    expect(buildRequest(invocation({ action: 'snapshot', cursor: 5, maxNodes: 50 }))).toEqual({ op: 'snapshot', cursor: 5, maxNodes: 50 })
  })

  it('requires --ref for click, --ref and --text for type', () => {
    expect(() => buildRequest(invocation({ action: 'click' }))).toThrow('--ref')
    expect(buildRequest(invocation({ action: 'click', ref: '1.1' }))).toEqual({ op: 'click', ref: '1.1' })
    expect(() => buildRequest(invocation({ action: 'type', ref: '1.1' }))).toThrow('--text')
    expect(buildRequest(invocation({ action: 'type', ref: '1.1', text: 'hi', submit: true, noClear: true }))).toEqual({ op: 'type', ref: '1.1', text: 'hi', submit: true, clear: false })
  })

  it('requires --ref and --option for select', () => {
    expect(() => buildRequest(invocation({ action: 'select', ref: '1.1' }))).toThrow('--option')
    expect(buildRequest(invocation({ action: 'select', ref: '1.1', option: 'x' }))).toEqual({ op: 'select', ref: '1.1', option: 'x' })
  })

  it('requires --key for press; --ref is optional', () => {
    expect(() => buildRequest(invocation({ action: 'press' }))).toThrow('--key')
    expect(buildRequest(invocation({ action: 'press', key: 'Enter' }))).toEqual({ op: 'press', key: 'Enter' })
  })

  it('requires --direction for scroll', () => {
    expect(() => buildRequest(invocation({ action: 'scroll' }))).toThrow('--direction')
    expect(buildRequest(invocation({ action: 'scroll', direction: 'down', amount: 200 }))).toEqual({ op: 'scroll', direction: 'down', amount: 200 })
  })

  it('builds a wait request from whichever fields are given', () => {
    expect(buildRequest(invocation({ action: 'wait', text: 'Done', gone: true, timeoutMs: 1000 }))).toEqual({ op: 'wait', text: 'Done', gone: true, timeoutMs: 1000 })
  })
})

function runningApp(): RunningApp {
  return { id: 'acryl', name: 'acryl', home: '/h', pid: 1, port: 3100 }
}

describe('runControlCommand', () => {
  it('lists running instances without calling the channel', async () => {
    const call = vi.fn()
    const result = await runControlCommand(invocation({ action: 'list' }), { discover: () => [runningApp()], call })
    expect(result).toEqual({ kind: 'list', instances: [runningApp()] })
    expect(call).not.toHaveBeenCalled()
  })

  it('picks the running instance and returns the channel result', async () => {
    const value: UiResult = { generation: 1, title: 'ACRYL', total: 0, nodes: [] }
    const call = vi.fn(async () => value)
    const result = await runControlCommand(invocation({ action: 'snapshot' }), { discover: () => [runningApp()], call })
    expect(result).toEqual({ kind: 'result', app: 'acryl', result: value })
    expect(call).toHaveBeenCalledWith(runningApp(), { op: 'snapshot' })
  })

  it('turns a UiControlError into a structured refusal instead of throwing', async () => {
    const call = vi.fn(async () => { throw new UiControlError('no-window', 'no ACRYL window is open to control') })
    const result = await runControlCommand(invocation({ action: 'click', ref: '1.1' }), { discover: () => [runningApp()], call })
    expect(result).toEqual({ kind: 'refused', app: 'acryl', code: 'no-window', message: 'no ACRYL window is open to control' })
  })
})
