// A small ACP agent for the tests: it speaks ACP v1 over stdio and does what the prompt says.
//   hello       two message chunks, a thought, one tool call that completes and one that fails, then end_turn
//   permission  asks for permission and answers with the option it was given (or "cancelled")
//   wait        holds the turn until session/cancel, then ends it as cancelled
//   refuse      ends the turn with stopReason refusal
//   crash       prints a reason on stderr and exits with code 3
//   count       answers how many prompts this session has had
//   spawn       starts a child of its own (a tool process), records its pid, and ends the turn
// It appends its pid to FAKE_ACP_PIDS and every message both ways to FAKE_ACP_WIRE (for the schema check), and ends when its stdin closes, as an ACP agent does.
import { spawn } from 'node:child_process'
import { appendFileSync } from 'node:fs'

if (process.env.FAKE_ACP_PIDS) appendFileSync(process.env.FAKE_ACP_PIDS, `${process.pid}\n`)
const record = (direction, message) => {
  if (process.env.FAKE_ACP_WIRE)
    appendFileSync(process.env.FAKE_ACP_WIRE, `${JSON.stringify({ direction, message })}\n`)
}

let nextId = 1
const waiting = new Map()
const send = (message) => {
  const whole = { jsonrpc: '2.0', ...message }
  record('toClient', whole)
  process.stdout.write(`${JSON.stringify(whole)}\n`)
}
const ask = (method, params) =>
  new Promise((resolve) => {
    const id = `agent-${nextId++}`
    waiting.set(id, resolve)
    send({ id, method, params })
  })
const update = (sessionId, value) =>
  send({ method: 'session/update', params: { sessionId, update: value } })
const text = (sessionId, chunk) =>
  update(sessionId, {
    sessionUpdate: 'agent_message_chunk',
    content: { type: 'text', text: chunk },
  })

let prompts = 0
let held

async function prompt(id, { sessionId, prompt: blocks }) {
  prompts += 1
  const said = blocks.map((block) => block.text).join('')
  switch (said) {
    case 'hello':
      text(sessionId, 'Hel')
      update(sessionId, {
        sessionUpdate: 'agent_thought_chunk',
        content: { type: 'text', text: 'thinking' },
      })
      text(sessionId, 'lo')
      update(sessionId, {
        sessionUpdate: 'tool_call',
        toolCallId: 't1',
        title: 'Read README.md',
        status: 'pending',
        rawInput: { path: 'README.md' },
      })
      update(sessionId, {
        sessionUpdate: 'tool_call_update',
        toolCallId: 't1',
        status: 'completed',
        rawOutput: { lines: 3 },
      })
      update(sessionId, {
        sessionUpdate: 'tool_call',
        toolCallId: 't2',
        title: 'Run npm test',
        status: 'in_progress',
      })
      update(sessionId, {
        sessionUpdate: 'tool_call_update',
        toolCallId: 't2',
        status: 'failed',
        content: [{ type: 'content', content: { type: 'text', text: 'exit code 1' } }],
      })
      return send({ id, result: { stopReason: 'end_turn' } })
    case 'permission': {
      const answer = await ask('session/request_permission', {
        sessionId,
        toolCall: { toolCallId: 't3', title: 'Write index.ts' },
        options: [
          { optionId: 'yes', name: 'Allow', kind: 'allow_once' },
          { optionId: 'no', name: 'Reject', kind: 'reject_once' },
        ],
      })
      text(sessionId, answer.outcome.outcome === 'selected' ? answer.outcome.optionId : 'cancelled')
      return send({ id, result: { stopReason: 'end_turn' } })
    }
    case 'wait':
      text(sessionId, 'working')
      held = () => send({ id, result: { stopReason: 'cancelled' } })
      return
    case 'refuse':
      return send({ id, result: { stopReason: 'refusal' } })
    case 'crash':
      process.stderr.write('boom: the fake agent crashed\n')
      return process.exit(3)
    case 'spawn': {
      const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
        stdio: 'ignore',
      })
      if (process.env.FAKE_ACP_PIDS) appendFileSync(process.env.FAKE_ACP_PIDS, `${child.pid}\n`)
      text(sessionId, 'started')
      return send({ id, result: { stopReason: 'end_turn' } })
    }
    case 'count':
      text(sessionId, `prompts ${prompts}`)
      return send({ id, result: { stopReason: 'end_turn' } })
    default:
      return send({
        id,
        error: { code: -32602, message: `the fake agent does not know "${said}"` },
      })
  }
}

let buffer = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  for (let end = buffer.indexOf('\n'); end !== -1; end = buffer.indexOf('\n')) {
    const message = JSON.parse(buffer.slice(0, end))
    buffer = buffer.slice(end + 1)
    record('toAgent', message)
    if (message.method === undefined) {
      waiting.get(message.id)?.(message.result)
      waiting.delete(message.id)
    } else if (message.method === 'initialize')
      send({ id: message.id, result: { protocolVersion: 1, agentCapabilities: {} } })
    else if (message.method === 'session/new')
      send({ id: message.id, result: { sessionId: `session-${process.pid}` } })
    else if (message.method === 'session/prompt') void prompt(message.id, message.params)
    else if (message.method === 'session/cancel') {
      held?.()
      held = undefined
    } else if (message.id !== undefined)
      send({ id: message.id, error: { code: -32601, message: 'unknown method' } })
  }
})
process.stdin.on('end', () => process.exit(0))
