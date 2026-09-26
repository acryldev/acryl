/**
 * Stub ACP server for testing the Devin ACP transport.
 *
 * Speaks ACP v1 JSON-RPC over stdio. Responds to initialize, session/new,
 * session/prompt, session/cancel, and session/load. Sends session/update
 * notifications during prompt turns.
 *
 * Usage: node stub-acp-server.mjs
 * Reads JSON-RPC messages from stdin (line-delimited), writes to stdout.
 *
 * Test hooks via environment:
 * - STUB_ACP_CAPTURE: path to a file; every inbound message is appended as
 *   one JSON line (lets tests inspect e.g. initialize params).
 * - STUB_ACP_HANG: comma-separated method names the stub never answers
 *   (timeout/abort tests).
 * - STUB_ACP_FAIL_ONCE_FILE: path to a marker file; the first initialize on
 *   the first process that finds the file absent writes it and replies with
 *   a JSON-RPC error — later spawns succeed (retry tests).
 * - STUB_ACP_PERMISSION_PROMPT: when `1`, every session/prompt sends a
 *   `session/request_permission` request mid-turn and waits for the
 *   client's answer before replying. The answer is echoed back as an
 *   `agent_message_chunk` update whose text is `permission:<json>`.
 * - STUB_ACP_PERMISSION_OPTIONS: comma-separated option kinds offered in
 *   the permission request (optionId = `opt_<kind>`). `none` offers no
 *   options. Default: `allow_once,reject_once`.
 */

import * as readline from 'node:readline'
import { appendFileSync, existsSync, writeFileSync } from 'node:fs'

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })

const captureFile = process.env.STUB_ACP_CAPTURE
const hangMethods = new Set((process.env.STUB_ACP_HANG ?? '').split(',').filter(Boolean))
const failOnceFile = process.env.STUB_ACP_FAIL_ONCE_FILE
const permissionPrompt = process.env.STUB_ACP_PERMISSION_PROMPT === '1'
const permissionKinds = (process.env.STUB_ACP_PERMISSION_OPTIONS ?? 'allow_once,reject_once')
  .split(',')
  .filter((kind) => kind !== '' && kind !== 'none')

let nextSessionId = 1
let nextOutboundId = 100000
const sessions = new Map()
const outbound = new Map()

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n')
}

function sendNotification(method, params) {
  send({ jsonrpc: '2.0', method, params })
}

/**
 * Send a session/request_permission request to the client and wait for its
 * response. Times out after 5s so a broken client never wedges the stub.
 */
function requestPermission(sessionId) {
  const options = permissionKinds.map((entry) => {
    const [kind, optionId] = entry.split(':', 2)
    return {
      optionId: optionId ?? `opt_${kind}`,
      name: kind,
      kind,
    }
  })
  const id = nextOutboundId++
  send({
    jsonrpc: '2.0',
    id,
    method: 'session/request_permission',
    params: {
      sessionId,
      toolCall: {
        toolCallId: 'call_perm',
        title: 'Privileged operation',
        kind: 'execute',
        status: 'pending',
      },
      options,
    },
  })
  return new Promise((resolve) => {
    outbound.set(id, resolve)
    setTimeout(() => {
      if (outbound.delete(id)) resolve({ timeout: true })
    }, 5000)
  })
}

rl.on('line', (line) => {
  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    return
  }

  if (captureFile) appendFileSync(captureFile, line.trim() + '\n')

  // A response to one of the stub's own outbound requests (no method field).
  if (msg.method === undefined && msg.id !== undefined) {
    const resolve = outbound.get(msg.id)
    if (resolve !== undefined) {
      outbound.delete(msg.id)
      resolve(msg)
    }
    return
  }

  if (typeof msg.method === 'string' && hangMethods.has(msg.method)) return

  if (msg.method === 'initialize') {
    if (failOnceFile && !existsSync(failOnceFile)) {
      writeFileSync(failOnceFile, 'failed')
      send({
        jsonrpc: '2.0',
        id: msg.id,
        error: { code: -32603, message: 'stub initialize failure (fail-once)' },
      })
      return
    }
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: 1,
        agentCapabilities: {
          loadSession: true,
          promptCapabilities: { image: false, audio: false, embeddedContext: false },
        },
        agentInfo: { name: 'stub-acp', title: 'Stub ACP', version: '0.0.1' },
        authMethods: [],
      },
    })
  } else if (msg.method === 'session/new') {
    const sessionId = `sess_${nextSessionId++}`
    sessions.set(sessionId, { cwd: msg.params?.cwd, history: [] })
    send({ jsonrpc: '2.0', id: msg.id, result: { sessionId } })
  } else if (msg.method === 'session/prompt') {
    const sessionId = msg.params?.sessionId
    const prompt = msg.params?.prompt

    // Send a plan update
    sendNotification('session/update', {
      sessionId,
      update: { sessionUpdate: 'plan', entries: [{ content: 'Process prompt', priority: 'high', status: 'in_progress' }] },
    })

    // Send an agent message chunk
    sendNotification('session/update', {
      sessionId,
      update: { sessionUpdate: 'agent_message_chunk', messageId: 'msg_1', content: { type: 'text', text: 'Working on it...' } },
    })

    // Send a tool call
    sendNotification('session/update', {
      sessionId,
      update: { sessionUpdate: 'tool_call', toolCallId: 'call_1', title: 'Read file', kind: 'other', status: 'pending' },
    })

    // Tool call completed
    sendNotification('session/update', {
      sessionId,
      update: { sessionUpdate: 'tool_call_update', toolCallId: 'call_1', status: 'completed' },
    })

    const finish = () => {
      // Final message
      sendNotification('session/update', {
        sessionId,
        update: { sessionUpdate: 'agent_message_chunk', messageId: 'msg_2', content: { type: 'text', text: 'Done!' } },
      })

      // Respond with stop reason
      send({ jsonrpc: '2.0', id: msg.id, result: { stopReason: 'end_turn' } })
    }

    if (permissionPrompt) {
      // Ask for permission mid-turn; the turn completes only after the
      // client answers (or the request times out).
      void requestPermission(sessionId).then((answer) => {
        sendNotification('session/update', {
          sessionId,
          update: {
            sessionUpdate: 'agent_message_chunk',
            messageId: 'msg_perm',
            content: { type: 'text', text: `permission:${JSON.stringify(answer?.result ?? answer?.error ?? answer)}` },
          },
        })
        finish()
      })
    } else {
      finish()
    }
  } else if (msg.method === 'session/cancel') {
    // Notification — no response. The pending session/prompt call will
    // get a cancelled stop reason from the stub.
    // In a real agent, the prompt response would arrive with stopReason: cancelled.
    // For the stub, we send the prompt response if there's a pending one.
    // (The test handles this by checking the prompt resolves.)
  } else if (msg.method === 'session/load') {
    const sessionId = msg.params?.sessionId
    if (sessions.has(sessionId)) {
      // Replay history (empty for stub)
      send({ jsonrpc: '2.0', id: msg.id, result: null })
    } else {
      send({
        jsonrpc: '2.0',
        id: msg.id,
        error: { code: -32602, message: 'Session not found' },
      })
    }
  } else if (msg.method === 'session/request_permission') {
    // Client→agent direction is unused; answer with a spec-valid cancelled
    // outcome rather than an invented shape.
    send({ jsonrpc: '2.0', id: msg.id, result: { outcome: { outcome: 'cancelled' } } })
  }
})

rl.on('close', () => {
  process.exit(0)
})
