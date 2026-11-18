import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { pinnedInstance, withPort } from '../plugins/instance/index.ts'
import { type App, createApp } from '../src/app.ts'

/** Throwaway homes live inside the project (`.acrylblends/` is ignored by git): a sandboxed agent may not write to the system temp folder. */
const scratch = join(fileURLToPath(new URL('..', import.meta.url)), '.acrylblends', 'test')
mkdirSync(scratch, { recursive: true })

const projectRoot = fileURLToPath(new URL('..', import.meta.url))

async function withApp(run: (app: App) => Promise<void>) {
  const home = await mkdtemp(join(scratch, 'agent-test-'))
  const app = await createApp(withPort(pinnedInstance(home, { root: projectRoot }), 0), {
    listen: false,
  })
  try {
    await run(app)
  } finally {
    await app.stop()
    await rm(home, { recursive: true, force: true })
  }
}

const ask = (app: App, body: unknown) =>
  app.root.router.request(`/ask`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

test('the agent uses a tool and answers over HTTP', () =>
  withApp(async (app) => {
    const answer = (await (await ask(app, { question: 'add 2 3' })).json()) as {
      output: string
      trace: unknown[]
    }
    assert.equal(answer.output, 'The answer is 5.')
    assert.deepEqual(answer.trace, [{ tool: 'add', input: [2, 3], result: 5 }])
  }))

test('a body without a question is refused', () =>
  withApp(async (app) => {
    const response = await ask(app, {})
    assert.equal(response.status, 400)
    await response.body?.cancel()
  }))
