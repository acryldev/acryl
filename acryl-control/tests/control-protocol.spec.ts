import { Context } from '@deepseek-ai/cordis'
import { createConnection } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  AcrControlProtocolService,
  type AcrControlProtocolBootstrap,
} from '../src/protocol/service.ts'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, {
    force: true,
    recursive: true,
  })))
})

async function socketPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'acryl-protocol-'))
  temporaryDirectories.push(directory)
  return join(directory, 'control.sock')
}

interface Client {
  request(line: string): Promise<{ status: number; body: unknown }>
  close(): void
}

function connect(address: string): Promise<Client> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(address)
    let buffer = ''
    socket.on('connect', () => {
      resolve({
        request(line) {
          return new Promise((resolveRequest) => {
            socket.write(line + '\n')
            const onData = (chunk: Buffer) => {
              buffer += chunk.toString('utf8')
              if (buffer.includes('\n')) {
                socket.off('data', onData)
                const body = JSON.parse(buffer.slice(0, buffer.indexOf('\n')))
                buffer = ''
                resolveRequest({ status: 200, body })
              }
            }
            socket.on('data', onData)
          })
        },
        close() {
          socket.destroy()
        },
      })
    })
    socket.on('error', reject)
  })
}

async function boot(address: string, overrides: Partial<AcrControlProtocolBootstrap> = {}) {
  const ctx = new Context()
  const bootstrap: AcrControlProtocolBootstrap = {
    endpoint: { kind: 'unix', address, protocolVersion: 1 },
    generationId: 'generation-1',
    capabilities: ['host.status', 'architecture.inspect'],
    handle: async (operation, payload) => ({ operation, payload }),
    ...overrides,
  }
  const fiber = ctx.plugin(AcrControlProtocolService, bootstrap)
  await fiber
  return { ctx, fiber, service: ctx.acrControlProtocol }
}

describe('AcrControlProtocolService', () => {
  it('serves a valid request with the canonical success envelope', async () => {
    const address = await socketPath()
    const { fiber } = await boot(address)
    const client = await connect(address)
    const response = await client.request(JSON.stringify({
      generationId: 'generation-1',
      operation: 'host.status',
      payload: { mode: 'direct' },
    }))
    expect(response.body).toEqual({
      schemaVersion: 1,
      ok: true,
      operation: 'host.status',
      result: { operation: 'host.status', payload: { mode: 'direct' } },
    })
    client.close()
    await fiber.dispose()
  })

  it('rejects a stale generation', async () => {
    const address = await socketPath()
    const { fiber } = await boot(address)
    const client = await connect(address)
    const response = await client.request(JSON.stringify({
      generationId: 'generation-old',
      operation: 'host.status',
      payload: null,
    }))
    expect(response.body).toMatchObject({
      ok: false,
      error: { code: 'generation-mismatch', retryable: false },
    })
    client.close()
    await fiber.dispose()
  })

  it('rejects an unknown capability', async () => {
    const address = await socketPath()
    const { fiber } = await boot(address)
    const client = await connect(address)
    const response = await client.request(JSON.stringify({
      generationId: 'generation-1',
      operation: 'agent.control',
      payload: null,
    }))
    expect(response.body).toMatchObject({
      ok: false,
      error: { code: 'unknown-capability' },
    })
    client.close()
    await fiber.dispose()
  })

  it('rejects malformed JSON', async () => {
    const address = await socketPath()
    const { fiber } = await boot(address)
    const client = await connect(address)
    const response = await client.request('not-json')
    expect(response.body).toMatchObject({
      ok: false,
      error: { code: 'invalid-request' },
    })
    client.close()
    await fiber.dispose()
  })

  it('reports handler failures through the failure envelope', async () => {
    const address = await socketPath()
    const { fiber } = await boot(address, {
      handle: async () => {
        const error = new Error('boom') as Error & { code: string }
        error.code = 'ACRYL_PROTECTED'
        throw error
      },
    })
    const client = await connect(address)
    const response = await client.request(JSON.stringify({
      generationId: 'generation-1',
      operation: 'architecture.inspect',
      payload: null,
    }))
    expect(response.body).toMatchObject({
      ok: false,
      error: { code: 'ACRYL_PROTECTED', message: 'boom' },
    })
    client.close()
    await fiber.dispose()
  })

  it('closes the endpoint and aborts connections on disposal', async () => {
    const address = await socketPath()
    const { fiber } = await boot(address)
    const client = await connect(address)
    await fiber.dispose()
    // After disposal the socket file is unlinked and the server is closed.
    const { stat } = await import('node:fs/promises')
    await expect(stat(address)).rejects.toThrow()
    client.close()
  })
})
