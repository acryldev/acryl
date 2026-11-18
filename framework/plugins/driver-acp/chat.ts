/**
 * An ACP agent as a chat driver of the panel. The agent process starts at the first message and keeps one ACP session, so later messages continue the same conversation;
 * an agent that ended is started again, with a new session, at the next message. One message runs at a time; a second one waits for the first.
 *
 * What the panel gets from the ACP updates: the agent's message chunks as `text`, each finished tool call as one `tool` (its title, input, and result or error), and an
 * `error` for a turn that stopped short (a refusal, a token or request limit, an agent that ended). Thoughts, plans and the rest stay out of the chat.
 */
import type { ChatDriver, ChatEvent } from '../agent-panel/drivers.ts'
import { type AcpAgent, type AcpConnection, AcpError } from './connection.ts'

/** Which answer a permission request gets: the agent's own "allow once" or "reject once" option. */
export type AcpPermissions = 'allow' | 'reject'

/** The ACP version this client speaks. */
const PROTOCOL_VERSION = 1

/** An agent connection with its session. */
interface Session {
  readonly connection: AcpConnection
  readonly id: string
}

/**
 * Opens a connection to the agent and returns it with the function that closes it. The plugin acquires it inside one `ctx.effect`, so unloading the plugin ends the process.
 */
export type OpenAgent = (
  agent: AcpAgent,
  handle: (method: string, params: unknown) => unknown,
) => {
  connection: AcpConnection
  close(): Promise<void>
}

interface ToolUpdate {
  toolCallId: string
  title?: string | null
  status?: string | null
  rawInput?: unknown
  rawOutput?: unknown
  content?: Array<{ type?: string; content?: { type?: string; text?: string } }> | null
}

/** Why a turn stopped short, in the panel's words; `undefined` for a turn that ended normally or was cancelled. */
function stopMessage(name: string, stopReason: unknown): string | undefined {
  switch (stopReason) {
    case 'end_turn':
    case 'cancelled':
      return undefined
    case 'refusal':
      return `${name} refused to continue`
    case 'max_tokens':
      return `${name} stopped at its token limit`
    case 'max_turn_requests':
      return `${name} stopped at its limit of model requests for one message`
    default:
      return `${name} stopped (${String(stopReason)})`
  }
}

/** The text an ACP tool call produced, when it reports text content and no raw output. */
function toolText(update: ToolUpdate): string | undefined {
  const text = (update.content ?? [])
    .map((item) =>
      item.type === 'content' && item.content?.type === 'text' ? item.content.text : undefined,
    )
    .filter((part): part is string => typeof part === 'string')
    .join('\n')
  return text || undefined
}

/** The answer to `session/request_permission`: the agent's option of the wanted kind, or `cancelled` when it offers none or the turn was cancelled. */
function permissionAnswer(
  params: unknown,
  permissions: AcpPermissions,
  cancelled: boolean,
): unknown {
  const options = ((params as { options?: Array<{ optionId: string; kind: string }> }).options ??
    []) as Array<{ optionId: string; kind: string }>
  const wanted =
    permissions === 'allow' ? ['allow_once', 'allow_always'] : ['reject_once', 'reject_always']
  const option = cancelled
    ? undefined
    : wanted.map((kind) => options.find((o) => o.kind === kind)).find(Boolean)
  return {
    outcome: option ? { outcome: 'selected', optionId: option.optionId } : { outcome: 'cancelled' },
  }
}

export function acpDriver(options: {
  /** The driver's name in the panel (`acp:dsh`). */
  name: string
  agent: AcpAgent
  /** The app folder: the agent's working directory and its session's `cwd`. */
  cwd: string
  permissions: AcpPermissions
  open: OpenAgent
}): ChatDriver {
  const { name, agent, cwd, permissions, open } = options
  let session: Promise<Session> | undefined
  /** The connection `session` belongs to, so only its own end clears it. */
  let live: AcpConnection | undefined
  let turnCancelled = false
  let queue: Promise<void> = Promise.resolve()

  const startSession = async (): Promise<Session> => {
    const { connection, close } = open(agent, (method, params) => {
      if (method === 'session/request_permission')
        return permissionAnswer(params, permissions, turnCancelled)
      throw new AcpError(`${method} is not offered by this client`, -32601)
    })
    // An agent that ends is started again at the next message.
    live = connection
    void connection.ended.then(() => {
      if (live !== connection) return
      live = undefined
      session = undefined
    })
    try {
      await connection.request('initialize', {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
        clientInfo: { name: 'acrylblends-driver-acp', version: '1' },
      })
      const created = await connection.request<{ sessionId: string }>('session/new', {
        cwd,
        mcpServers: [],
      })
      return { connection, id: created.sessionId }
    } catch (error) {
      await close()
      throw error
    }
  }

  return {
    kind: 'chat',
    name,
    async *start({ message, signal }) {
      // One message at a time: this one waits for the one before it.
      const previous = queue
      let finished!: () => void
      queue = new Promise((resolve) => (finished = resolve))
      try {
        await previous
        if (signal.aborted) return
        let current: Session
        try {
          session ??= startSession()
          current = await session
        } catch (error) {
          session = undefined
          yield {
            event: 'error',
            data: { message: error instanceof Error ? error.message : String(error) },
          }
          return
        }
        yield* turn(current, message, signal)
      } finally {
        finished()
      }
    },
  }

  async function* turn(
    current: Session,
    message: string,
    signal: AbortSignal,
  ): AsyncGenerator<ChatEvent> {
    const events: ChatEvent[] = []
    let wake: (() => void) | undefined
    let settled = false
    const push = (event: ChatEvent): void => {
      events.push(event)
      wake?.()
    }
    /** What earlier updates said about each tool call: its title and its input arrive before its result. */
    const calls = new Map<string, { title?: string; input?: unknown }>()
    const off = current.connection.onNotification((method, params) => {
      const { sessionId, update } = params as {
        sessionId?: string
        update?: { sessionUpdate?: string } & ToolUpdate & { content?: unknown }
      }
      if (method !== 'session/update' || sessionId !== current.id || !update) return
      if (update.sessionUpdate === 'agent_message_chunk') {
        const content = update.content as { type?: string; text?: string } | undefined
        if (content?.type === 'text' && content.text)
          push({ event: 'text', data: { text: content.text } })
        return
      }
      if (update.sessionUpdate !== 'tool_call' && update.sessionUpdate !== 'tool_call_update')
        return
      const call = calls.get(update.toolCallId) ?? {}
      if (update.title) call.title = update.title
      if (update.rawInput !== undefined) call.input = update.rawInput
      calls.set(update.toolCallId, call)
      if (update.status !== 'completed' && update.status !== 'failed') return
      const tool = call.title ?? update.toolCallId
      const output = update.rawOutput ?? toolText(update)
      push({
        event: 'tool',
        data: {
          tool,
          ...(call.input === undefined ? {} : { input: call.input }),
          ...(update.status === 'failed'
            ? {
                error:
                  output === undefined
                    ? 'failed'
                    : String(typeof output === 'string' ? output : JSON.stringify(output)),
              }
            : { result: output }),
        },
      })
    })
    turnCancelled = false
    const cancel = (): void => {
      turnCancelled = true
      current.connection.notify('session/cancel', { sessionId: current.id })
    }
    signal.addEventListener('abort', cancel, { once: true })
    current.connection
      .request<{ stopReason?: unknown }>('session/prompt', {
        sessionId: current.id,
        prompt: [{ type: 'text', text: message }],
      })
      .then(
        (result) => {
          const stopped = signal.aborted ? undefined : stopMessage(name, result.stopReason)
          if (stopped) push({ event: 'error', data: { message: stopped } })
        },
        (error: unknown) => {
          if (!signal.aborted)
            push({
              event: 'error',
              data: { message: error instanceof Error ? error.message : String(error) },
            })
        },
      )
      .finally(() => {
        settled = true
        wake?.()
      })
    try {
      for (;;) {
        const next = events.shift()
        if (next) yield next
        else if (settled) return
        else await new Promise<void>((resolve) => (wake = resolve))
      }
    } finally {
      off()
      signal.removeEventListener('abort', cancel)
      // The panel stopped reading before the turn ended: the agent is told to stop it.
      if (!settled) cancel()
    }
  }
}
