import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { bootAcrylHarnessProfile } from '../src/index.ts'

const temporaryHomes: string[] = []
const initialDshHome = process.env.DSH_HOME

afterEach(async () => {
  process.env.DSH_HOME = initialDshHome
  await Promise.all(temporaryHomes.splice(0).map(home => rm(home, { force: true, recursive: true })))
})

describe('bootAcrylHarnessProfile', () => {
  it('boots the pinned profile in one root with durable session and agent services', async () => {
    const home = await mkdtemp(join(tmpdir(), 'acryl-harness-home-'))
    temporaryHomes.push(home)
    process.env.DSH_HOME = home

    const runtime = await bootAcrylHarnessProfile({ profile: 'acryl-test' })

    expect(runtime.ctx.get('sessions')).toBeDefined()
    expect(runtime.ctx.get('agents')).toBeDefined()
    await runtime.dispose()
  })
})
