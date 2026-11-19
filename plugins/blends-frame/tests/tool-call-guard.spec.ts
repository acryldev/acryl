import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  COMMAND_GRACE_MS,
  FINISH_LIMIT_MS,
  HOST_REFUSAL,
  PREPARE_LIMIT_MS,
  STOP_WAIT_MS,
  TOOL_CALL_STALLED,
  commandLimitMs,
  guardToolCalls,
  stopsHost,
  type GuardedExecution,
  type StalledResult,
  type ToolCallEvents,
} from '../src/tool-call-guard.ts'

type Listener = (...args: never[]) => unknown

/** The events as DSH delivers them: the guard's listeners, called by the test around a stage that does whatever the test says. */
function harness() {
  const listeners = new Map<string, Listener>()
  const lines: string[] = []
  const events = {
    on(name: string, listener: Listener) {
      listeners.set(name, listener)
      return () => { listeners.delete(name) }
    },
  } as unknown as ToolCallEvents
  const dispose = guardToolCalls(events, line => { lines.push(line) })
  const call = (name: string, ...args: unknown[]): Promise<unknown> => (listeners.get(name) as unknown as (...a: unknown[]) => Promise<unknown>)(...args)
  const event = (session: string, type: string, id: string): void => {
    (listeners.get('session/event') as unknown as (s: { id: string }, e: { type: string; data: unknown }) => void)({ id: session }, { type, data: { id } })
  }
  return { listeners, lines, dispose, call, event }
}

const exec = (args: unknown = { command: 'npm test', timeoutMs: 240_000 }, name = 'bash'): GuardedExecution & { controller: AbortController } => {
  const controller = new AbortController()
  return { name, arguments: args, agent: { session: { id: 's1' } }, signal: controller.signal, controller }
}
const never = <T>(): Promise<T> => new Promise<T>(() => {})
const textOf = (result: unknown): string => (result as StalledResult).content[0].text

describe('an agent stopping the Host', () => {
  const host = { hostPid: 96684, hostPort: 3730 }
  const bash = (command: string) => ({ name: 'bash', arguments: { command } })

  it('sees a kill of its id, its port or its script', () => {
    expect(stopsHost(bash('kill 96684; sleep 1; lsof -nP -iTCP:3730'), host)).toBe(true)
    expect(stopsHost(bash('lsof -ti :3730 | xargs kill -9'), host)).toBe(true)
    expect(stopsHost(bash('pkill -f ide-host'), host)).toBe(true)
    expect(stopsHost({ name: 'bash', arguments: '{"command":"kill -9 96684"}' }, host)).toBe(true)
  })

  it('leaves other commands alone, a kill of something else among them', () => {
    expect(stopsHost(bash('lsof -nP -iTCP:3730 -sTCP:LISTEN'), host)).toBe(false)
    expect(stopsHost(bash('kill 1234'), host)).toBe(false)
    expect(stopsHost(bash('kill 966840'), host)).toBe(false)
    expect(stopsHost({ name: 'read', arguments: { command: 'kill 96684' } }, host)).toBe(false)
  })

  // A packaged Host: the app binary runs the generated script, and `node` appears in the loader argument. Its group is its own (the desktop spawns it detached).
  const running = {
    hostPid: 96684,
    hostPort: 3730,
    hostGroupId: 96684,
    hostName: 'ACRYL Blends Blank',
    hostCommand:
      '/Applications/ACRYL Blends Blank.app/Contents/MacOS/ACRYL Blends Blank --import ./plugins/acryl-node-server/src/register.ts /Users/x/Documents/ACRYL Blends Blank/scripts/ide-host.mjs',
  }

  it('sees a broad kill of every node process', () => {
    expect(stopsHost(bash('pkill node'), running)).toBe(true)
    expect(stopsHost(bash('pkill -9 node'), running)).toBe(true)
    expect(stopsHost(bash('killall node'), running)).toBe(true)
    expect(stopsHost(bash('killall -9 node'), running)).toBe(true)
    expect(stopsHost(bash('pkill -f node'), running)).toBe(true)
  })

  it('sees a -f pattern that matches the Host command line', () => {
    expect(stopsHost(bash('pkill -f acryl-node-server'), running)).toBe(true)
    expect(stopsHost(bash("pkill -f 'scripts/ide'"), running)).toBe(true)
    expect(stopsHost(bash('pkill -f "ACRYL Blends Blank"'), running)).toBe(true)
    expect(stopsHost(bash('pkill -f "ide-host.mjs"'), running)).toBe(true)
  })

  it('sees a kill of the Host process group', () => {
    expect(stopsHost(bash('kill 0'), running)).toBe(true)
    expect(stopsHost(bash('kill -9 -1'), running)).toBe(true)
    expect(stopsHost(bash('kill -TERM -96684'), running)).toBe(true)
    expect(stopsHost(bash('kill -- -96684'), running)).toBe(true)
    expect(stopsHost(bash('pkill -g 96684 vitest'), running)).toBe(true)
    expect(stopsHost(bash('pkill --pgroup 96684 vitest'), running)).toBe(true)
  })

  it('leaves the agent its own test servers, by id, pattern or name', () => {
    expect(stopsHost(bash('kill 4321'), running)).toBe(false)
    expect(stopsHost(bash('kill -9 4321; sleep 1'), running)).toBe(false)
    expect(stopsHost(bash('pkill -f "vite --port 5199"'), running)).toBe(false)
    expect(stopsHost(bash('killall vitest'), running)).toBe(false)
    expect(stopsHost(bash('kill -TERM 12345'), running)).toBe(false)
    expect(stopsHost(bash('pkill -g 12345 vitest'), running)).toBe(false)
    expect(stopsHost(bash('echo killall node'), running)).toBe(false)
    expect(stopsHost(bash('grep -rn "pkill node" docs'), running)).toBe(false)
  })

  it('sees taskkill and Stop-Process by a name that would reach the Host', () => {
    expect(stopsHost(bash('taskkill /IM node.exe /F'), running)).toBe(true)
    expect(stopsHost(bash('Stop-Process -Name node -Force'), running)).toBe(true)
    expect(stopsHost(bash('taskkill /PID 4321 /F'), running)).toBe(false)
    expect(stopsHost(bash('taskkill /IM notepad.exe /F'), running)).toBe(false)
  })

  it('tells the agent how to restart only its own process', () => {
    expect(HOST_REFUSAL).toMatch(/kill <pid>/u)
    expect(HOST_REFUSAL).toMatch(/never a group, a name like node, or a broad -f pattern/u)
  })

  it('refuses it without asking the gates', async () => {
    const listeners = new Map<string, Listener>()
    const events = { on(name: string, listener: Listener) { listeners.set(name, listener); return () => {} } } as unknown as ToolCallEvents
    const lines: string[] = []
    guardToolCalls(events, line => { lines.push(line) }, host)
    let asked = false
    const decision = await (listeners.get('tools/pre-execute') as unknown as (e: unknown, n: () => Promise<unknown>) => Promise<unknown>)(exec({ command: 'kill 96684' }), async () => { asked = true; return { kind: 'allow' } })
    expect(decision).toEqual({ kind: 'deny', reason: HOST_REFUSAL })
    expect(asked).toBe(false)
    expect(lines).toHaveLength(1)
  })
})

describe('the limit on a tool call', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('takes a shell command\'s own timeout plus the grace, and leaves other tools alone', () => {
    expect(commandLimitMs({ name: 'bash', arguments: { timeoutMs: 240_000 } })).toBe(240_000 + COMMAND_GRACE_MS)
    expect(commandLimitMs({ name: 'bash', arguments: '{"timeoutMs": 1000}' })).toBe(1000 + COMMAND_GRACE_MS)
    expect(commandLimitMs({ name: 'pwsh', arguments: {} })).toBe(120_000 + COMMAND_GRACE_MS)
    expect(commandLimitMs({ name: 'bash', arguments: { timeoutMs: 'soon' } })).toBe(120_000 + COMMAND_GRACE_MS)
    expect(commandLimitMs({ name: 'agent', arguments: { timeoutMs: 1 } })).toBeUndefined()
  })

  it('refuses a call held up before it runs, and says so, and Stop ends the wait at once', async () => {
    const h = harness()
    const held = h.call('tools/pre-execute', exec(), () => never())
    await vi.advanceTimersByTimeAsync(PREPARE_LIMIT_MS)
    const decision = await held as { kind: string; reason: string }
    expect(decision.kind).toBe('deny')
    expect(decision.reason).toContain('did not run')
    expect(h.lines).toEqual(['tool call stalled before running: bash, 120 seconds'])

    const stopped = exec()
    const waiting = h.call('tools/pre-execute', stopped, () => never())
    stopped.controller.abort()
    expect(await waiting).toEqual({ kind: 'cancel' })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('passes a gate\'s own decision through and leaves no timer behind', async () => {
    const h = harness()
    expect(await h.call('tools/pre-execute', exec(), async () => ({ kind: 'ask', reason: 'r' }))).toEqual({ kind: 'ask', reason: 'r' })
    expect(await h.call('tools/post-execute', exec(), {}, async () => ({ kind: 'block' }))).toEqual({ kind: 'block' })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ends a command stuck past its timeout: tells it to stop, then answers with a sentence', async () => {
    const h = harness()
    const call = exec({ command: 'npm test', timeoutMs: 1000 })
    const upstream = call.signal
    let seen: AbortSignal | undefined
    const held = h.call('tools/execute', call, () => { seen = call.signal; return never() })
    await vi.advanceTimersByTimeAsync(1000 + COMMAND_GRACE_MS - 1)
    expect(seen?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(seen?.aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(STOP_WAIT_MS)
    const result = await held as StalledResult
    expect(result.isError).toBe(true)
    expect(result.error.info.code).toBe(TOOL_CALL_STALLED)
    expect(textOf(result)).toContain('so the chat does not hang')
    expect(call.signal).toBe(upstream)
    expect(h.lines).toEqual(['tool call stuck and did not return: bash'])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('answers with the sentence too when the command obeys the stop', async () => {
    const h = harness()
    const call = exec({ timeoutMs: 1000 })
    const held = h.call('tools/execute', call, () => new Promise((resolve) => {
      call.signal.addEventListener('abort', () => { resolve({ content: [], isError: true }) })
    }))
    await vi.advanceTimersByTimeAsync(1000 + COMMAND_GRACE_MS)
    expect(textOf(await held)).toContain('so the chat does not hang')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('never touches a command that returns in time', async () => {
    const h = harness()
    const call = exec()
    const answer = { content: [{ type: 'text', text: 'ok' }] }
    expect(await h.call('tools/execute', call, async () => answer)).toBe(answer)
    expect(h.lines).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('gives Stop a short wait, then ends a command that does not return', async () => {
    const h = harness()
    const call = exec()
    const held = h.call('tools/execute', call, () => never())
    call.controller.abort()
    await vi.advanceTimersByTimeAsync(STOP_WAIT_MS)
    expect(textOf(await held)).toContain('was stopped')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps a command that obeys Stop answering for itself', async () => {
    const h = harness()
    const call = exec()
    const aborted = { content: [{ type: 'text', text: 'aborted' }], isError: true }
    const held = h.call('tools/execute', call, () => new Promise((resolve) => {
      call.signal.addEventListener('abort', () => { resolve(aborted) })
    }))
    call.controller.abort()
    expect(await held).toBe(aborted)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('waits while a person has a prompt open in that chat', async () => {
    const h = harness()
    const call = exec({ timeoutMs: 1000, sandbox_permissions: 'danger-full-access' })
    let settled = false
    const held = h.call('tools/execute', call, () => never()).finally(() => { settled = true })
    h.event('s1', 'approval/asked', 'a1')
    await vi.advanceTimersByTimeAsync(10 * (1000 + COMMAND_GRACE_MS))
    expect(settled).toBe(false)
    h.event('s1', 'approval/decided', 'a1')
    await vi.advanceTimersByTimeAsync(1000 + COMMAND_GRACE_MS + STOP_WAIT_MS)
    expect(textOf(await held)).toContain('so the chat does not hang')
  })

  it('does not wait for a prompt in another chat', async () => {
    const h = harness()
    const held = h.call('tools/execute', exec({ timeoutMs: 1000 }), () => never())
    h.event('s2', 'approval/asked', 'a1')
    await vi.advanceTimersByTimeAsync(1000 + COMMAND_GRACE_MS + STOP_WAIT_MS)
    expect(textOf(await held)).toContain('so the chat does not hang')
  })

  it('keeps the result of a call held up after it ran', async () => {
    const h = harness()
    const held = h.call('tools/post-execute', exec(), {}, () => never())
    await vi.advanceTimersByTimeAsync(FINISH_LIMIT_MS)
    expect(await held).toEqual({ kind: 'accept' })
    expect(h.lines).toEqual(['tool call stalled after running: bash, 60 seconds'])
  })

  it('gives other tools no limit while they run', async () => {
    const h = harness()
    const answer = {}
    const held = h.call('tools/execute', exec({}, 'agent'), async () => { await new Promise(resolve => setTimeout(resolve, 3_600_000)); return answer })
    await vi.advanceTimersByTimeAsync(3_600_000)
    expect(await held).toBe(answer)
  })

  it('stops every listener and limit when disposed', () => {
    const h = harness()
    void h.call('tools/pre-execute', exec(), () => never())
    expect(vi.getTimerCount()).toBe(1)
    h.dispose()
    expect(h.listeners.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })
})
