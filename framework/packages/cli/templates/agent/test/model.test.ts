import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { pinnedInstance, withPort } from '../plugins/instance/index.ts'
import { createApp } from '../src/app.ts'

/** Throwaway homes live inside the project (`.acrylblends/` is ignored by git): a sandboxed agent may not write to the system temp folder. */
const scratch = join(fileURLToPath(new URL('..', import.meta.url)), '.acrylblends', 'test')
mkdirSync(scratch, { recursive: true })

/** A plugin no scripted command knows: the model writes it from scratch. */
const COUNTER = `import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from 'acrylblends'

export const name = 'counter'
export const inject = ['router']
export function apply(ctx: Context) {
  let count = 0
  ctx.router.route('/', new Acryl().get('/count', (c) => c.json({ count: ++count })))
}
`

/** Stands in for a real model API: plans write_plugin, then install_plugin, then answers. */
async function modelApi() {
  const replies = [
    {
      tool_calls: [
        {
          id: '1',
          type: 'function',
          function: {
            name: 'write_plugin',
            arguments: JSON.stringify({ name: 'counter', files: { 'index.ts': COUNTER } }),
          },
        },
      ],
    },
    {
      tool_calls: [
        {
          id: '2',
          type: 'function',
          function: { name: 'install_plugin', arguments: '{"name":"counter"}' },
        },
      ],
    },
    { content: 'I built a counter: GET /count.' },
  ]
  // The model API is answered in process: the global fetch is wrapped for the model's address, so no port is needed.
  const realFetch = globalThis.fetch
  const url = 'http://model.test/v1'
  globalThis.fetch = async (input, init) => {
    const target = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (!target.startsWith(url)) return realFetch(input, init)
    return Response.json({ choices: [{ message: replies.shift() ?? { content: 'no more' } }] })
  }
  return {
    url,
    close: async () => {
      globalThis.fetch = realFetch
    },
  }
}

test('with a real model, the agent writes a new Cordis plugin and the running app serves it', async () => {
  const api = await modelApi()
  const project = await mkdtemp(join(scratch, 'model-project-'))
  const app = await createApp(
    withPort(pinnedInstance(join(project, '.acrylblends'), { root: project }), 0),
    {
      model: { baseUrl: api.url, model: 'test' },
      listen: false,
    },
  )
  try {
    const answer = await (
      await app.root.router.request(`/ask`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: 'add a counter route' }),
      })
    ).json()
    assert.equal((answer as { output: string }).output, 'I built a counter: GET /count.')
    assert.deepEqual(await (await app.root.router.request(`/count`)).json(), { count: 1 })
    assert.deepEqual(await (await app.root.router.request(`/count`)).json(), { count: 2 })
  } finally {
    await app.stop()
    await api.close()
    await rm(project, { recursive: true, force: true })
  }
})
