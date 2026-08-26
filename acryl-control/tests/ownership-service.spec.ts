import { Context } from '@deepseek-ai/cordis'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  AcrProfileOwnershipService,
  type AcrProfileOwnershipBootstrap,
} from '../src/ownership/lease-provider.ts'

const temporaryDirectories: string[] = []

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'acryl-ownership-service-'))
  temporaryDirectories.push(directory)
  return directory
}

function bootstrap(stateDirectory: string, hostId: string): AcrProfileOwnershipBootstrap {
  return {
    stateDirectory,
    request: {
      profileKey: 'desktop',
      host: {
        hostId,
        kind: 'tui',
        generationId: `generation-${hostId}`,
        pid: process.pid,
        startedAt: '2026-08-26T00:00:00.000Z',
        protocolVersion: 1,
        status: 'ready',
      },
      endpoint: {
        kind: 'unix',
        address: `/tmp/${hostId}.sock`,
        protocolVersion: 1,
      },
    },
  }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, {
    force: true,
    recursive: true,
  })))
})

describe('AcrProfileOwnershipService', () => {
  it('provides one owned generation and releases it on Fiber disposal', async () => {
    const stateDirectory = await temporaryDirectory()
    const firstContext = new Context()
    const firstFiber = firstContext.plugin(
      AcrProfileOwnershipService,
      bootstrap(stateDirectory, 'first'),
    )
    await firstFiber
    const first = firstContext.acrProfileOwnership

    expect(first.current.kind).toBe('owned')
    expect(first.current.lease.ownerHostId).toBe('first')

    const secondContext = new Context()
    const secondFiber = secondContext.plugin(
      AcrProfileOwnershipService,
      bootstrap(stateDirectory, 'second'),
    )
    await secondFiber
    expect(secondContext.acrProfileOwnership.current.kind).toBe('attached')

    await secondFiber.dispose()
    await firstFiber.dispose()
    expect(() => first.current).toThrow('profile ownership service disposed')

    const replacementContext = new Context()
    const replacementFiber = replacementContext.plugin(
      AcrProfileOwnershipService,
      bootstrap(stateDirectory, 'replacement'),
    )
    await replacementFiber
    expect(replacementContext.acrProfileOwnership.current.kind).toBe('owned')
    await replacementFiber.dispose()
  })
})
