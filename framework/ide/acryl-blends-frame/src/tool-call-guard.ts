/**
 * A tool call can never hold a builder's chat forever.
 *
 * DSH's agent loop awaits each stage of a tool call in turn, and its registry never abandons a stage's promise: a policy gate or a wrapper that does
 * not settle leaves the turn running with no process and no prompt, past the command's own timeout (which only arms inside the execute stage), and
 * the Stop button cannot end it either. This guard sits outside each stage and gives it a limit:
 *
 * - Before the tool runs (`tools/pre-execute`, every tool): over the limit, or on Stop, the call is refused without running. An approval is asked
 *   after this stage, so a person deciding is not counted.
 * - While a command runs (`tools/execute`, the shell tools): its own timeout plus a grace. A command past its timeout returns by itself (DSH keeps it
 *   as a job), so reaching this limit means the call is stuck. The command is asked to stop, then the call ends with a sentence that says what happened.
 *   Stop is given the same short wait. While a person has a prompt open in that chat the limit waits for them.
 * - After the tool ran (`tools/post-execute`, every tool): over the limit, the result is kept as it is.
 *
 * Each firing is reported with the stage and the tool, which is what the next stall needs for its root cause.
 *
 * One more thing can end a chat for good: an agent stopping the app's Host, which is the process running it and the frame. A shell command that kills
 * that process (by its id, its port or its script) is refused with what to do instead. It is a seat belt for an honest mistake, not a sandbox.
 */

export const PREPARE_LIMIT_MS = 120_000
export const FINISH_LIMIT_MS = 60_000
/** Past a command's timeout: what its kill escalation, its output and the session's flush may take before the call counts as stuck. */
export const COMMAND_GRACE_MS = 60_000
/** How long a command that was told to stop may take to return. */
export const STOP_WAIT_MS = 5_000
/** A command that names no timeout runs under this one (`bash-local`'s default). */
const DEFAULT_COMMAND_TIMEOUT_MS = 120_000
const SHELL_TOOLS: ReadonlySet<string> = new Set(['bash', 'pwsh'])

export const TOOL_CALL_STALLED = 'TOOL_CALL_STALLED'

/** The parts of a DSH tool execution the guard reads; `signal` it replaces for the stage, as DSH's own timeout policy does. */
export interface GuardedExecution {
  readonly name: string
  readonly arguments?: unknown
  readonly agent?: { readonly session: { readonly id: string } }
  signal: AbortSignal
}

/** The stalled call's result, in the shape DSH's timeout policy uses. */
export interface StalledResult {
  readonly content: readonly [{ readonly type: 'text'; readonly text: string }]
  readonly isError: true
  readonly error: { readonly message: string; readonly info: { readonly name: string; readonly code: string } }
}

type Decision = { readonly kind: 'deny'; readonly reason: string } | { readonly kind: 'cancel' } | { readonly kind: 'accept' } | object

/** The DSH events the guard listens on; each `on` returns its disposer. */
export interface ToolCallEvents {
  on(name: 'tools/pre-execute', listener: (exec: GuardedExecution, next: () => Promise<Decision>) => Promise<Decision>, options: { prepend: true }): () => void
  on(name: 'tools/execute', listener: (exec: GuardedExecution, next: () => Promise<object>) => Promise<object>, options: { prepend: true }): () => void
  on(name: 'tools/post-execute', listener: (exec: GuardedExecution, result: unknown, next: () => Promise<Decision>) => Promise<Decision>, options: { prepend: true }): () => void
  on(name: 'session/event', listener: (session: { readonly id: string }, event: { readonly type: string; readonly data: unknown }) => void): () => void
}

function parsed(args: unknown): Record<string, unknown> {
  if (typeof args === 'object' && args !== null) return args as Record<string, unknown>
  if (typeof args !== 'string') return {}
  try {
    const value: unknown = JSON.parse(args)
    return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

/** The limit of a shell call's execute stage; undefined for any other tool, whose run has no length to hold it to. */
export function commandLimitMs(exec: Pick<GuardedExecution, 'name' | 'arguments'>): number | undefined {
  if (!SHELL_TOOLS.has(exec.name)) return undefined
  const { timeoutMs } = parsed(exec.arguments)
  return (typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_COMMAND_TIMEOUT_MS) + COMMAND_GRACE_MS
}

const seconds = (ms: number): string => `${String(Math.round(ms / 1000))} seconds`

export function stalledResult(toolName: string, why: 'stuck' | 'stopped', limitMs: number): StalledResult {
  const message = why === 'stopped'
    ? `The ${toolName} call was stopped and did not return, so it was ended here. Its outcome is unknown.`
    : `The ${toolName} call had no result ${seconds(limitMs)} after it started, past its own timeout, so it was ended here so the chat does not hang. Its outcome is unknown. Say so to the person, and run it again only if it is still needed.`
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,
    error: { message, info: { name: 'ToolCallStalled', code: TOOL_CALL_STALLED } },
  }
}

/** The Host this guard runs in, as a shell command would name it. */
export interface HostIdentity {
  readonly hostPid: number
  readonly hostPort?: number
  /** The Host's process group: `kill 0`, `kill -- -<id>` or `pkill -g <id>` ends it too. */
  readonly hostGroupId?: number
  /** The Host's own command line (`process.execPath` and its arguments), for `pkill -f` patterns. */
  readonly hostCommand?: string
  /** The Host's process name, for `pkill`/`killall` without `-f`. */
  readonly hostName?: string
}

const KILL_VERBS: ReadonlySet<string> = new Set(['kill', 'pkill', 'killall', 'taskkill', 'stop-process'])

/** Words a kill may stand behind in a segment (`lsof ... | xargs kill`); an `echo killall node` is not an invocation. */
const KILL_LEADERS = /^(?:xargs|sudo|doas|env|time|timeout|nohup|command|nice|ionice|watch|exec)$/u

/** A command's words, quoted runs kept whole, so a `pkill -f "two words"` pattern survives as one word. */
function wordsOf(segment: string): string[] {
  const result: string[] = []
  const pattern = /"([^"]*)"|'([^']*)'|([^\s]+)/gu
  let match: RegExpExecArray | null
  while ((match = pattern.exec(segment)) !== null) result.push(match[1] ?? match[2] ?? match[3] ?? '')
  return result
}

interface KillInvocation {
  readonly verb: string
  readonly args: readonly string[]
}

/** Every kill-like invocation in a shell command, one per `;`/`&&`/`|` segment (a pipe's `xargs kill` included). */
function killInvocations(command: string): KillInvocation[] {
  const found: KillInvocation[] = []
  for (const segment of command.split(/[;&|\n]+/u)) {
    const parts = wordsOf(segment)
    const at = parts.findIndex((part) => KILL_VERBS.has(part.toLowerCase()))
    if (at === -1) continue
    const before = parts.slice(0, at)
    if (!before.every((part) => KILL_LEADERS.test(part) || part.startsWith('-') || /^\d+[smhd]?$/u.test(part))) continue
    found.push({ verb: parts[at]?.toLowerCase() ?? '', args: parts.slice(at + 1) })
  }
  return found
}

/** The names whose killing would reach the Host: its own, and the runtimes a Host runs under. */
function hostNames(host: HostIdentity): readonly string[] {
  return [host.hostName, 'node', 'npm', 'pnpm', 'npx', 'electron', 'Electron'].filter(
    (name): name is string => typeof name === 'string' && name !== '',
  )
}

/** Whether a `pkill`/`killall` name pattern matches the Host's process name (both are regular expressions to pkill). */
function matchesHostName(pattern: string, host: HostIdentity): boolean {
  return hostNames(host).some((name) => {
    if (pattern === name) return true
    try {
      return new RegExp(pattern, 'u').test(name)
    } catch {
      return name.includes(pattern)
    }
  })
}

/** Whether a `pkill -f` pattern matches the Host's command line. */
function matchesHostCommand(pattern: string, host: HostIdentity): boolean {
  if (host.hostCommand === undefined) return false
  if (host.hostCommand.includes(pattern)) return true
  try {
    return new RegExp(pattern, 'u').test(host.hostCommand)
  } catch {
    return false
  }
}

/** `kill`'s process-group target: `0` is the caller's group, `-1` every process, and the Host's own group holds the Host. */
function killGroup(word: string, host: HostIdentity): boolean {
  if (word === '0') return true
  const match = /^-(\d+)$/u.exec(word)
  if (match === null) return false
  const group = Number(match[1])
  // An unknown group id is not worth guessing about: a group kill can always be a kill by id instead.
  return group === 1 || host.hostGroupId === undefined || group === host.hostGroupId
}

/** `pkill -g`'s group (a positive id): `0` is the caller's group, and the Host's group holds the Host. */
function pgroup(word: string, host: HostIdentity): boolean {
  const group = Number(word)
  if (!Number.isInteger(group) || group < 0) return false
  return group === 0 || host.hostGroupId === undefined || group === host.hostGroupId
}

/** `kill`: its targets, after the signal (the first bare `-N`) and after `--`. */
function killTargets(args: readonly string[], host: HostIdentity): boolean {
  let signalRead = false
  let literal = false
  for (const [index, word] of args.entries()) {
    if (word === '--') { literal = true; continue }
    if (!literal && /^-[A-Za-z]/u.test(word)) continue
    if (!literal && /^-\d+$/u.test(word) && !signalRead && index === 0) { signalRead = true; continue }
    if (killGroup(word, host)) return true
  }
  return false
}

/** `pkill`: `-f` patterns against the Host's command line, names against its process name, and `-g` groups. */
function pkillTargets(args: readonly string[], host: HostIdentity): boolean {
  let full = false
  let pattern: string | undefined
  for (let index = 0; index < args.length; index += 1) {
    const word = args[index]
    if (word === undefined) break
    if (word === '-f' || word === '--full') { full = true; continue }
    if (word === '-g' || word === '--pgroup') {
      const value = args[index + 1]
      if (value !== undefined && pgroup(value, host)) return true
      index += 1
      continue
    }
    if (word.startsWith('--pgroup=')) { if (pgroup(word.slice(9), host)) return true; continue }
    if (/^-g\d+$/u.test(word)) { if (pgroup(word.slice(2), host)) return true; continue }
    if (word.startsWith('-')) continue
    if (pattern === undefined) pattern = word
  }
  if (pattern === undefined) return false
  return full ? matchesHostCommand(pattern, host) : matchesHostName(pattern, host)
}

/** `killall`: its names, which are process names. */
function killallTargets(args: readonly string[], host: HostIdentity): boolean {
  return args.filter((word) => !word.startsWith('-')).some((name) => matchesHostName(name, host))
}

/** `taskkill`/`Stop-Process`: a name that would reach the Host (its id is covered by the named check). */
function taskkillName(command: string, host: HostIdentity): boolean {
  if (!/\b(?:taskkill|stop-process)\b/iu.test(command)) return false
  return hostNames(host).some((name) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
    return new RegExp(`\\b${escaped}(?:\\.exe)?\\b`, 'iu').test(command)
  })
}

/** Whether a shell call would stop the Host. A kill alone is fine: agents stop their own test servers. */
export function stopsHost(exec: Pick<GuardedExecution, 'name' | 'arguments'>, host: HostIdentity): boolean {
  if (!SHELL_TOOLS.has(exec.name)) return false
  const { command } = parsed(exec.arguments)
  if (typeof command !== 'string' || !/\b(?:kill|pkill|killall|Stop-Process|taskkill)\b/iu.test(command)) return false
  // What the command names outright: the Host's id, its port, or its script (the input of a pipe may name the port, as `lsof -ti :3730 | xargs kill`).
  const named = host.hostPort === undefined ? String(host.hostPid) : `${String(host.hostPid)}|${String(host.hostPort)}`
  if (new RegExp(`\\b(?:${named})\\b|ide-host|acryl-node-server`, 'iu').test(command)) return true
  for (const invocation of killInvocations(command)) {
    if (invocation.verb === 'kill' && killTargets(invocation.args, host)) return true
    if (invocation.verb === 'pkill' && pkillTargets(invocation.args, host)) return true
    if (invocation.verb === 'killall' && killallTargets(invocation.args, host)) return true
  }
  return taskkillName(command, host)
}

export const HOST_REFUSAL = 'that command could stop the app\'s Host, the process running this chat and the page beside it: it names the Host, its process group, all node processes, or a pattern that matches it. It was not run. To restart only a process you started, stop that process by its own id (kill <pid>) and start it again; never a group, a name like node, or a broad -f pattern. A saved change in src/ or plugins/ reloads the app by itself; if a change does not show, the reload failed, so read the error and fix it.'

/**
 * Put the guard on the tool calls of every chat.
 * @param events - the plugin's context, as the events it listens on.
 * @param report - hears each firing.
 * @param host - the Host to protect from a shell command; left out, nothing is refused.
 * @returns the disposer: the listeners and every running limit stop.
 */
export function guardToolCalls(events: ToolCallEvents, report: (line: string) => void, host?: HostIdentity): () => void {
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const after = (ms: number, then: () => void): (() => void) => {
    const timer = setTimeout(() => {
      timers.delete(timer)
      then()
    }, ms)
    timers.add(timer)
    return () => {
      clearTimeout(timer)
      timers.delete(timer)
    }
  }
  /** The approvals open in each chat: the id of each `approval/asked` until its `approval/decided`. */
  const openApprovals = new Map<string, Set<unknown>>()

  const stopPre = events.on('tools/pre-execute', async (exec, next) => {
    if (host !== undefined && stopsHost(exec, host)) {
      report(`refused a shell command that would stop the Host: ${exec.name}`)
      return { kind: 'deny', reason: HOST_REFUSAL }
    }
    const ended = Promise.withResolvers<Decision>()
    const cancel = after(PREPARE_LIMIT_MS, () => {
      report(`tool call stalled before running: ${exec.name}, ${seconds(PREPARE_LIMIT_MS)}`)
      ended.resolve({ kind: 'deny', reason: `the ${exec.name} call was held up for ${seconds(PREPARE_LIMIT_MS)} before it could run, so it did not run. Say so to the person, and try it again if it is still needed.` })
    })
    const onStop = (): void => { ended.resolve({ kind: 'cancel' }) }
    exec.signal.addEventListener('abort', onStop, { once: true })
    try {
      return await Promise.race([next(), ended.promise])
    } finally {
      cancel()
      exec.signal.removeEventListener('abort', onStop)
    }
  }, { prepend: true })

  const stopExecute = events.on('tools/execute', async (exec, next) => {
    const limit = commandLimitMs(exec)
    if (limit === undefined) return next()
    const upstream = exec.signal
    const stop = new AbortController()
    const ended = Promise.withResolvers<StalledResult>()
    let cancel = (): void => {}
    let reason: 'stuck' | 'stopped' | undefined
    const giveUp = (why: 'stuck' | 'stopped'): void => {
      reason = why
      stop.abort(new Error(`${exec.name} call ${why}`))
      cancel()
      cancel = after(STOP_WAIT_MS, () => {
        report(`tool call ${why} and did not return: ${exec.name}`)
        ended.resolve(stalledResult(exec.name, why, limit))
      })
    }
    const arm = (): void => {
      cancel = after(limit, () => {
        const session = exec.agent?.session.id
        if (session !== undefined && (openApprovals.get(session)?.size ?? 0) > 0) arm()
        else giveUp('stuck')
      })
    }
    arm()
    const onStop = (): void => { if (reason === undefined) giveUp('stopped') }
    upstream.addEventListener('abort', onStop, { once: true })
    exec.signal = AbortSignal.any([upstream, stop.signal])
    try {
      const result = await Promise.race([next(), ended.promise])
      // The command answered our stop with its own abort: the person reads why it stopped.
      return reason === 'stuck' ? stalledResult(exec.name, reason, limit) : result
    } finally {
      cancel()
      upstream.removeEventListener('abort', onStop)
      exec.signal = upstream
    }
  }, { prepend: true })

  const stopPost = events.on('tools/post-execute', async (exec, _result, next) => {
    const ended = Promise.withResolvers<Decision>()
    const cancel = after(FINISH_LIMIT_MS, () => {
      report(`tool call stalled after running: ${exec.name}, ${seconds(FINISH_LIMIT_MS)}`)
      ended.resolve({ kind: 'accept' })
    })
    try {
      return await Promise.race([next(), ended.promise])
    } finally {
      cancel()
    }
  }, { prepend: true })

  const stopApprovals = events.on('session/event', (session, event) => {
    if (event.type !== 'approval/asked' && event.type !== 'approval/decided') return
    const id = (event.data as { readonly id?: unknown } | null)?.id
    const open = openApprovals.get(session.id) ?? new Set<unknown>()
    if (event.type === 'approval/asked') open.add(id)
    else open.delete(id)
    if (open.size === 0) openApprovals.delete(session.id)
    else openApprovals.set(session.id, open)
  })

  return () => {
    stopPre()
    stopExecute()
    stopPost()
    stopApprovals()
    for (const timer of timers) clearTimeout(timer)
    timers.clear()
  }
}
