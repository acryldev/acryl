import { describe, expect, it, vi } from 'vitest'
import type { RunningApp } from 'acryl-harness-runtime'
import { UiControlError, type UiResult } from 'acryl-agent-control'
import { buildRequest, buildToolCall, buildWorkerRequest, runControlCommand } from '../src/host/control-command.ts'
import { parseAcrylArgs } from '../src/cli/grammar.ts'
import { renderControl } from '../src/cli/control-render.ts'
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

describe('acryl control worker', () => {
  const worker = (patch: Partial<AcrylControlInvocation>): AcrylControlInvocation => invocation({ action: 'worker', ...patch })

  it('parses each operation and its options', () => {
    expect(parseAcrylArgs(['control', 'worker', 'list'])).toMatchObject({ kind: 'control', action: 'worker', workerOp: 'list' })
    expect(parseAcrylArgs(['control', 'worker', 'attach', '--cwd', '/p', '--worker', 'w1', '--resume', 's1', '--app', 'acryl'])).toMatchObject({ action: 'worker', workerOp: 'attach', cwd: '/p', worker: 'w1', resume: 's1', app: 'acryl' })
    expect(parseAcrylArgs(['control', 'worker', 'send', '--worker', 'w1', '--text', 'hi', '--json'])).toMatchObject({ workerOp: 'send', worker: 'w1', text: 'hi', json: true })
    expect(() => parseAcrylArgs(['control', 'worker'])).toThrow('usage: acryl control worker')
    expect(() => parseAcrylArgs(['control', 'worker', 'dance'])).toThrow('usage: acryl control worker')
  })

  it('builds the request, naming a missing option', () => {
    expect(buildWorkerRequest(worker({ workerOp: 'list' }))).toEqual({ op: 'list' })
    expect(buildWorkerRequest(worker({ workerOp: 'attach', cwd: '/p', worker: 'w1', resume: 's' }))).toEqual({ op: 'attach', provider: 'claude', cwd: '/p', workerId: 'w1', resume: 's' })
    expect(() => buildWorkerRequest(worker({ workerOp: 'attach' }))).toThrow('--cwd')
    expect(() => buildWorkerRequest(worker({ workerOp: 'attach', cwd: '/p', provider: 'codex' }))).toThrow('claude')
    expect(() => buildWorkerRequest(worker({ workerOp: 'send', worker: 'w1' }))).toThrow('--text')
    expect(buildWorkerRequest(worker({ workerOp: 'stop', worker: 'w1' }))).toEqual({ op: 'stop', workerId: 'w1' })
  })

  it('calls the workers endpoint of the picked instance and renders the answer', async () => {
    const callWorkers = vi.fn(async () => ({ ok: true as const, result: { text: 'pong', isError: false, sessionId: 's1' } }))
    const result = await runControlCommand(worker({ workerOp: 'send', worker: 'w1', text: 'ping' }), { discover: () => [runningApp()], call: vi.fn(), callWorkers })
    expect(callWorkers).toHaveBeenCalledWith(runningApp(), { op: 'send', workerId: 'w1', text: 'ping' })
    expect(renderControl(result, false)).toEqual({ lines: ['pong', 'session s1'], exitCode: 0 })
  })

  it('renders a list, a refusal as exit 1, and the JSON form', () => {
    const listed = { kind: 'worker' as const, app: 'acryl', response: { ok: true as const, result: [{ workerId: 'w1', providerId: 'claude', runtimeId: 'claude-1', workspace: { cwd: '/p' }, status: 'idle' }] } }
    expect(renderControl(listed, false).lines).toEqual(['w1  claude  idle  claude-1  /p'])
    expect(renderControl({ kind: 'worker', app: 'acryl', response: { ok: true, result: [] } }, false).lines).toEqual(['acryl: no workers'])
    const refused = { kind: 'worker' as const, app: 'acryl', response: { ok: false as const, code: 'unknown-worker', message: 'Unknown agent worker w9.' } }
    expect(renderControl(refused, false)).toEqual({ lines: ['acryl refused: unknown-worker - Unknown agent worker w9.'], exitCode: 1 })
    expect(renderControl(refused, true).exitCode).toBe(1)
  })
})

describe('acryl control tool', () => {
  const tool = (patch: Partial<AcrylControlInvocation>): AcrylControlInvocation => invocation({ action: 'tool', ...patch })

  it('parses list and call, with JSON arguments kept as text until built', () => {
    expect(parseAcrylArgs(['control', 'tool', 'list'])).toMatchObject({ action: 'tool', toolOp: 'list' })
    expect(parseAcrylArgs(['control', 'tool', 'call', '--tool', 'acryl_install_plugin', '--args', '{"path":"/p"}', '--app', 'acryl'])).toMatchObject({ toolOp: 'call', tool: 'acryl_install_plugin', args: '{"path":"/p"}', app: 'acryl' })
    expect(() => parseAcrylArgs(['control', 'tool'])).toThrow('usage: acryl control tool')
    expect(() => parseAcrylArgs(['control', 'tool', 'run'])).toThrow('usage: acryl control tool')
  })

  it('builds the call, refusing a missing tool or arguments that are not a JSON object', () => {
    expect(buildToolCall(tool({ toolOp: 'list' }))).toBeUndefined()
    expect(buildToolCall(tool({ toolOp: 'call', tool: 'acryl_list_plugins' }))).toEqual({ name: 'acryl_list_plugins', arguments: {} })
    expect(buildToolCall(tool({ toolOp: 'call', tool: 'acryl_install_plugin', args: '{"path":"/p"}' }))).toEqual({ name: 'acryl_install_plugin', arguments: { path: '/p' } })
    expect(() => buildToolCall(tool({ toolOp: 'call' }))).toThrow('--tool')
    expect(() => buildToolCall(tool({ toolOp: 'call', tool: 'x', args: '{nope' }))).toThrow('JSON object')
    expect(() => buildToolCall(tool({ toolOp: 'call', tool: 'x', args: '[1]' }))).toThrow('JSON object')
  })

  it('goes through the one gateway route and renders a list, an answer, a tool error and a refusal', async () => {
    const callToolGateway = vi.fn(async (_instance: RunningApp, call?: { name: string }) => call === undefined
      ? { ok: true as const, tools: [{ name: 'acryl_list_plugins', description: 'List plugins\nmore', inputSchema: {} }] }
      : { ok: true as const, isError: call.name === 'acryl_install_plugin', text: `${call.name} answered` })
    const run = (patch: Partial<AcrylControlInvocation>) => runControlCommand(tool(patch), { discover: () => [runningApp()], call: vi.fn(), callToolGateway })
    expect(renderControl(await run({ toolOp: 'list' }), false)).toEqual({ lines: ['acryl_list_plugins  List plugins'], exitCode: 0 })
    expect(renderControl(await run({ toolOp: 'call', tool: 'acryl_list_plugins' }), false)).toEqual({ lines: ['acryl_list_plugins answered'], exitCode: 0 })
    expect(renderControl(await run({ toolOp: 'call', tool: 'acryl_install_plugin' }), false)).toEqual({ lines: ['acryl_install_plugin answered'], exitCode: 1 })
    expect(callToolGateway).toHaveBeenCalledWith(runningApp(), { name: 'acryl_list_plugins', arguments: {} })
    const refused = { kind: 'tool' as const, app: 'acryl', response: { ok: false as const, code: 'not-exposed' as const, message: 'bash is not offered through the gateway' } }
    expect(renderControl(refused, false)).toEqual({ lines: ['acryl refused: not-exposed - bash is not offered through the gateway'], exitCode: 1 })
  })
})
