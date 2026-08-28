import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, type Server, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ControlEndpoint } from '../src/contracts/control-protocol.ts'
import {
  ENDPOINT_REQUEST_TIMEOUT_MS,
  createAcrylEndpointSessionClient,
} from '../src/protocol/endpoint-client.ts'

const temporaryDirectories: string[] = []
const servers: Server[] = []
const sockets = new Set<Socket>()

async function endpointFor(handler: (socket: Socket) => void): Promise<ControlEndpoint> {
  const directory = await mkdtemp(join(tmpdir(), 'acryl-endpoint-client-'))
  temporaryDirectories.push(directory)
  const server = createServer(handler)
  server.on('connection', socket => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })
  servers.push(server)
  const address = join(directory, 'control.sock')
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(address, () => resolve())
  })
  return { kind: 'unix', address, protocolVersion: 1 }
}

function snapshotResponse(): string {
  return `${JSON.stringify({
    ok: true,
    result: {
      profile: 'acryl-test',
      generationId: 'generation-test',
      attachment: 'owner',
      sessionId: 'session-test',
      agentStatus: 'idle',
      transcript: [],
      tools: [],
    },
  })}\n`
}

afterEach(async () => {
  vi.useRealTimers()
  for (const socket of sockets) socket.destroy()
  sockets.clear()
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { force: true, recursive: true })))
})

describe('createAcrylEndpointSessionClient', () => {
  it('settles a request when the endpoint closes before responding', async () => {
    const endpoint = await endpointFor(socket => socket.end())
    const client = createAcrylEndpointSessionClient(endpoint, 'generation-test', 'a'.repeat(64))

    await expect(Promise.race([
      client.snapshot('session-test'),
      new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error('endpoint request did not settle')), 50)),
    ])).rejects.toThrow(/closed|socket|endpoint/i)
  })

  it('settles a request when the endpoint connection errors', async () => {
    const endpoint: ControlEndpoint = {
      kind: 'unix',
      address: join(tmpdir(), `acryl-missing-${crypto.randomUUID()}.sock`),
      protocolVersion: 1,
    }
    const client = createAcrylEndpointSessionClient(endpoint, 'generation-test', 'a'.repeat(64))

    await expect(client.snapshot('session-test')).rejects.toThrow()
  })

  it('settles a request when the endpoint does not respond before its deadline', async () => {
    let accepted!: () => void
    const connectionAccepted = new Promise<void>(resolve => { accepted = resolve })
    const endpoint = await endpointFor(() => accepted())
    const client = createAcrylEndpointSessionClient(endpoint, 'generation-test', 'a'.repeat(64))

    const request = client.snapshot('session-test')
    await connectionAccepted

    await expect(request).rejects.toThrow(/timed out/i)
  }, ENDPOINT_REQUEST_TIMEOUT_MS + 2_000)

  it('does not overlap snapshot polls when an endpoint responds slower than the polling cadence', async () => {
    let activeRequests = 0
    let maximumActiveRequests = 0
    const endpoint = await endpointFor(socket => {
      socket.once('data', () => {
        activeRequests += 1
        maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests)
        setTimeout(() => {
          socket.end(snapshotResponse())
          activeRequests -= 1
        }, 50)
      })
    })
    const client = createAcrylEndpointSessionClient(endpoint, 'generation-test', 'a'.repeat(64))
    const subscription = await client.subscribe('session-test', () => undefined)

    await new Promise(resolve => setTimeout(resolve, 175))
    await subscription.dispose()

    expect(maximumActiveRequests).toBe(1)
  })
})
