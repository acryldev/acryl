import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import * as signIn from '../src/index.ts'
import { SIGN_IN_ANSWER_PATH, SIGN_IN_ATTEMPT_PATH, SIGN_IN_BEGIN_PATH, SIGN_IN_CANCEL_PATH, SIGN_IN_PROVIDERS_PATH } from '../src/contract.ts'

// FiberState is a const enum in the shipped build, so compare numbers.
const PENDING = 0
const ACTIVE = 2
const settle = (): Promise<void> => new Promise(resolve => { setTimeout(resolve, 0) })

function webServer() {
  const paths: string[] = []
  return {
    port: 4321,
    paths,
    register(route: { path: string }) { paths.push(route.path); return () => { paths.splice(paths.indexOf(route.path), 1) } },
  }
}

const authorization = { list: () => [], begin: async () => ({ status: 'cancelled' }) }
const credentials = { describeRecord: async () => ({ configured: false }) }
const ALL = [SIGN_IN_PROVIDERS_PATH, SIGN_IN_ATTEMPT_PATH, SIGN_IN_BEGIN_PATH, SIGN_IN_ANSWER_PATH, SIGN_IN_CANCEL_PATH]

describe('acryl-sign-in Host plugin', () => {
  it('waits for the web server and the harness authorization and credentials services, then serves its five routes', async () => {
    const server = webServer()
    const root = new Context()
    const fiber = root.plugin(signIn)
    await settle()
    expect(fiber.state).toBe(PENDING)
    root.provide('acrylWeb', server)
    root.provide('authorization', authorization)
    await settle()
    expect(fiber.state).toBe(PENDING)
    root.provide('credentials', credentials)
    await settle()
    expect(fiber.state).toBe(ACTIVE)
    expect(server.paths).toEqual(ALL)
    await fiber.dispose()
    expect(server.paths).toEqual([])
  })

  it('takes its routes down when the authorization service goes away and restores them when it returns', async () => {
    const server = webServer()
    const root = new Context()
    root.provide('acrylWeb', server)
    root.provide('credentials', credentials)
    const withdraw = root.provide('authorization', authorization)
    const fiber = root.plugin(signIn)
    await settle()
    expect(server.paths).toEqual(ALL)
    withdraw()
    await settle()
    expect(server.paths).toEqual([])
    expect(fiber.state).toBe(PENDING)
    root.provide('authorization', authorization)
    await settle()
    expect(server.paths).toEqual(ALL)
    expect(new Set(server.paths).size).toBe(ALL.length)
    await fiber.dispose()
  })
})
