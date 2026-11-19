/**
 * A refusal may be answered without the handler reading the request body (a guard's 403, a 415, a body over its limit). The adapter must let the
 * client finish sending first: ending the response with request data unread closes the socket with data pending, and the peer reads a reset
 * instead of the answer (read ECONNRESET in the workspace git worktree test, run 41253137126, and reproducible on macOS with this client). The
 * client here writes half a body and waits, which a server that answers at once fails deterministically on every system.
 */

import { createServer, type Server } from 'node:http'
import { connect, type Socket } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { serve, type FetchRouter } from '../src/serve.ts'

// The answer a private route's own-page guard gives a cross-origin change: decided from the headers, without reading the body.
const refusing: FetchRouter = {
  fetch() {
    return Promise.resolve(new Response(JSON.stringify({ error: 'only this app\'s own page may call this' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    }))
  },
}

let server: Server | undefined

afterEach(async () => {
  if (server === undefined) return
  const closing = server
  server = undefined
  closing.closeAllConnections()
  await new Promise<void>((resolve) => { closing.close(() => { resolve() }) })
})

async function listen(router: FetchRouter): Promise<number> {
  const created = createServer((req, res) => { void serve(router, req, res) })
  server = created
  await new Promise<void>((resolve) => { created.listen(0, '127.0.0.1', () => { resolve() }) })
  const address = created.address()
  return typeof address === 'object' && address !== null ? address.port : 0
}

/** Everything the socket read within `ms`, or undefined when nothing arrived. A socket error is the reset this test exists to prevent. */
function readWithin(socket: Socket, ms: number): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off('data', onData); resolve(undefined) }, ms)
    const onData = (chunk: Buffer): void => {
      clearTimeout(timer)
      socket.off('data', onData)
      resolve(chunk.toString('utf8'))
    }
    socket.on('data', onData)
    socket.once('error', (error) => { clearTimeout(timer); reject(error) })
  })
}

/** The rest of the answer, until the server closes the connection it was asked to close. */
function readToEnd(socket: Socket): Promise<string> {
  return new Promise((resolve, reject) => {
    let text = ''
    socket.setTimeout(5_000, () => { reject(new Error('the answer did not finish')) })
    socket.on('data', (chunk: Buffer) => { text += chunk.toString('utf8') })
    socket.on('end', () => { resolve(text) })
    socket.on('error', reject)
  })
}

describe('a refusal the handler answers before reading the request body', () => {
  it('waits for the body, so the client finishes writing and reads the 403 instead of a reset', async () => {
    const port = await listen(refusing)
    const socket = connect(port, '127.0.0.1')
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => { resolve() })
      socket.once('error', reject)
    })
    const head = `POST /api/refuse HTTP/1.1\r\nhost: 127.0.0.1:${String(port)}\r\ncontent-type: application/json\r\ncontent-length: 64\r\nconnection: close\r\n\r\n`
    socket.write(`${head}${'x'.repeat(32)}`)
    // Nothing about the answer depends on the body, so a server that answers while half of it is still unsent is the defect.
    expect(await readWithin(socket, 300)).toBeUndefined()
    socket.write('y'.repeat(32))
    const response = await readToEnd(socket)
    expect(response.startsWith('HTTP/1.1 403')).toBe(true)
    expect(response).toContain('only this app')
    socket.destroy()
  })
})
