/**
 * Stub ACP server for testing the Devin ACP transport.
 *
 * Speaks ACP v1 JSON-RPC over stdio. Responds to initialize, session/new,
 * session/prompt, session/cancel, and session/load. Sends session/update
 * notifications during prompt turns.
 *
 * Usage: node stub-acp-server.mjs
 * Reads JSON-RPC messages from stdin (line-delimited), writes to stdout.
 */

import * as readline from 'node:readline'

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })

let nextSessionId = 1
const sessions = new Map()

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n')
}

function sendNotification(method, params) {
  send({ jsonrpc: '2.0', method, params })
}

rl.on('line', (line) => {
  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    return
  }

  if (msg.method === 'initialize') {
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

    // Final message
    sendNotification('session/update', {
      sessionId,
      update: { sessionUpdate: 'agent_message_chunk', messageId: 'msg_2', content: { type: 'text', text: 'Done!' } },
    })

    // Respond with stop reason
    send({ jsonrpc: '2.0', id: msg.id, result: { stopReason: 'end_turn' } })
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
    // Not used in stub tests
    send({ jsonrpc: '2.0', id: msg.id, result: { outcome: 'granted' } })
  }
})

rl.on('close', () => {
  process.exit(0)
})
