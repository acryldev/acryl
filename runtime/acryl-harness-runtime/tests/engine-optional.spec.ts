/**
 * T043 (spec 001): the DeepSeek Harness chat is optional. Booted from the `acryl.agents` Blueprint the Web engine keeps its frame (web server, session
 * store, client, workspace, terminals, Agent Control) with the chat's agent and model rows off, nothing FAILED, and the same live host brings the chat
 * back by editing three rows. This is the real Loader on the real DSH profile, not a stub.
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { afterEach, describe, expect, it } from 'vitest'
import { DSH_CHAT_ROW_IDS } from '../src/blueprint/index.ts'
import { createWebEngineDefinition } from '../src/engine-dsh.ts'
import { createAcrylEngineHost } from '../src/engine-host.ts'

const STATES = ['PENDING', 'LOADING', 'ACTIVE', 'FAILED', 'UNLOADING', 'DISPOSED']
const homes: string[] = []
const saved = { home: process.env.DSH_HOME, blueprint: process.env.ACRYL_BLUEPRINT }

afterEach(async () => {
  for (const [key, variable] of [['home', 'DSH_HOME'], ['blueprint', 'ACRYL_BLUEPRINT']] as const) {
    if (saved[key] === undefined) delete process.env[variable]
    else process.env[variable] = saved[key]
  }
  await Promise.all(homes.splice(0).map(home => rm(home, { force: true, recursive: true })))
})

type Host = Awaited<ReturnType<typeof createAcrylEngineHost>>

async function boot(blueprint: string): Promise<Host> {
  const home = await mkdtemp(join(tmpdir(), 'acryl-optional-'))
  homes.push(home)
  process.env.DSH_HOME = home
  process.env.ACRYL_BLUEPRINT = blueprint
  return createAcrylEngineHost({
    engines: [createWebEngineDefinition(new URL('../package.json', import.meta.url).href)],
    initialEngine: 'dsh',
    prepare: ctx => { provideCmdline(ctx, { args: ['--no-open', '--port', '0'], exit: () => {} }) },
  })
}

function states(host: Host): Map<string, string> {
  return new Map([...host.ctx.loader.entries()].map(entry => [entry.options.id ?? '', STATES[entry.fiber?.state as number] ?? 'NONE']))
}

async function settle(host: Host): Promise<void> {
  await host.ctx.loader.await()
  await new Promise(resolve => setTimeout(resolve, 500))
}

describe('the DSH chat is optional (T043)', () => {
  it('keeps the frame alive with the chat off, parks only chat consumers, and brings the chat back live', async () => {
    const host = await boot('acryl.agents')
    try {
      await settle(host)
      const off = states(host)
      for (const id of DSH_CHAT_ROW_IDS) expect(off.get(id), id).not.toBe('ACTIVE')
      // The frame: the server, the session store, the client, the terminals and ACRYL's own rows.
      for (const id of ['web', 'session', 'session-persistence-jsonl', 'terminal-controller', 'workspace-controller', 'acryl-workspace', 'acryl-agent-control', 'tools']) {
        expect(off.get(id), id).toBe('ACTIVE')
      }
      // Rows that need the chat wait (PENDING) instead of failing; Cordis reactivates them when it returns.
      expect([...off].filter(([, state]) => state === 'FAILED')).toEqual([])
      expect(off.get('session-controller')).toBe('PENDING')
      const parked = [...off].filter(([, state]) => state === 'PENDING').map(([id]) => id)

      // Chat back on: three row edits on the same live host, no restart.
      for (const entry of host.ctx.loader.entries()) {
        if (DSH_CHAT_ROW_IDS.includes(entry.options.id ?? '')) entry.update({ disabled: false })
      }
      await settle(host)
      const on = states(host)
      for (const id of DSH_CHAT_ROW_IDS) expect(on.get(id), id).toBe('ACTIVE')
      expect(on.get('session-controller')).toBe('ACTIVE')
      expect([...on].filter(([, state]) => state === 'FAILED')).toEqual([])
      expect(parked.length).toBeGreaterThan(0)
    } finally {
      await host.dispose()
    }
  }, 120_000)
})
