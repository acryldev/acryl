import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { agent, memory, model, scripted, tools } from '../index.ts'

async function boot() {
  const root = new Context()
  for (const plugin of [model, tools, memory, agent]) await root.plugin(plugin).await()
  return root
}

test('uses a tool and answers with its result, with the call in the trace', async () => {
  const root = await boot()
  assert.deepEqual(await root.agent.run('add 2 3'), {
    status: 'completed',
    output: 'The answer is 5.',
    steps: 2,
    trace: [{ tool: 'add', input: [2, 3], result: 5 }],
  })
})

test('answers a plain question in one step and remembers it', async () => {
  const root = await boot()
  const result = await root.agent.run('hello')
  assert.equal(result.status === 'completed' && result.output, 'You said: hello')
  assert.equal(root.memory.size(), 1)
})

test('a taught rule drives a multi-step run; a failing tool is reported to the model, not thrown', async () => {
  const root = await boot()
  const teacher = root.plugin({
    name: 'teacher',
    inject: ['model', 'tools'],
    apply(ctx: Context) {
      ctx.effect(() =>
        ctx.tools.register('fails', {
          description: 'always fails',
          run: () => Promise.reject(new Error('nope')),
        }),
      )
      ctx.effect(
        () =>
          scripted(ctx.model)?.teach(({ question, step, toolResult }) => {
            if (question !== 'try') return undefined
            return step === 0
              ? { tool: 'fails', input: {} }
              : { text: `got ${JSON.stringify(toolResult)}` }
          }) ?? (() => {}),
      )
    },
  })
  await teacher.await()
  const result = await root.agent.run('try')
  assert.equal(result.status === 'completed' && result.output, 'got {"error":"nope"}')
  assert.deepEqual(result.trace, [{ tool: 'fails', input: {}, error: 'nope' }])
  await teacher.dispose()
  assert.equal(
    (await root.agent.run('try')).status === 'completed' && (await root.agent.run('try')).steps,
    1,
  )
})

test('a run that never finishes stops at its budget', async () => {
  const root = new Context()
  for (const plugin of [model, tools, memory]) await root.plugin(plugin).await()
  await root.plugin(agent, { steps: 3 }).await()
  scripted(root.model)?.teach(() => ({ tool: 'add', input: [1, 1] }))
  const result = await root.agent.run('loop')
  assert.deepEqual([result.status, result.steps, result.trace.length], ['budget_exceeded', 3, 3])
})

test('with tasks mounted, a run is a durable task that owns one task per tool call', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { instance, pinnedInstance } = await import('../../instance/index.ts')
  const { tasks } = await import('../../tasks/index.ts')
  const home = mkdtempSync(join(tmpdir(), 'agent-tasks-'))
  const root = new Context()
  for (const [plugin, config] of [
    [instance, pinnedInstance(home)],
    [tasks],
    [model],
    [tools],
    [memory],
    [agent],
  ] as const) {
    await root.plugin(plugin as never, config as never).await()
  }
  const result = await root.agent.run('add 2 3')
  assert.equal(typeof result.task, 'string')
  const run = root.tasks.get(result.task as string)
  assert.deepEqual(
    [run?.kind, run?.status, run?.result],
    ['agent-run', 'completed', 'The answer is 5.'],
  )
  assert.deepEqual(
    root.tasks
      .list({ parent: result.task as string })
      .map((call) => [call.kind, call.status, call.result]),
    [['tool:add', 'completed', 5]],
  )
  rmSync(home, { recursive: true, force: true })
})

/** A model step that never answers on its own; it settles only when its signal aborts (or, with `ignoresSignal`, never). */
const hang = (signal?: AbortSignal) =>
  new Promise<never>((_, reject) =>
    signal?.addEventListener('abort', () => reject(new Error('stopped'))),
  )

test('aborting during a model call ends the run cancelled, at once', async () => {
  const root = await boot()
  let seen: AbortSignal | undefined
  root.model.complete = (input) => {
    seen = input.signal
    return new Promise(() => {}) // a model that ignores its signal cannot hold the run
  }
  const stop = new AbortController()
  const run = root.agent.run('slow', { signal: stop.signal })
  setTimeout(() => stop.abort(), 10)
  const result = await run
  assert.deepEqual([result.status, result.steps, result.trace.length], ['cancelled', 0, 0])
  assert.equal(seen?.aborted, true)
})

test('aborting during a tool call ends the run cancelled and the trace says so', async () => {
  const root = await boot()
  let toolSignal: AbortSignal | undefined
  root.tools.register('slow', {
    description: 'never ends on its own',
    run: (_input, options) => {
      toolSignal = options?.signal
      return hang(options?.signal)
    },
  })
  scripted(root.model)?.teach(() => ({ tool: 'slow', input: null }))
  const stop = new AbortController()
  const run = root.agent.run('use the slow tool', { signal: stop.signal })
  setTimeout(() => stop.abort(), 10)
  const result = await run
  assert.equal(result.status, 'cancelled')
  assert.deepEqual(
    result.trace.map((call) => [call.tool, call.error]),
    [['slow', 'cancelled']],
  )
  assert.equal(toolSignal?.aborted, true)
})

test('a signal that is already aborted ends the run before the first step', async () => {
  const root = await boot()
  const result = await root.agent.run('add 2 3', { signal: AbortSignal.abort() })
  assert.deepEqual([result.status, result.steps, result.trace.length], ['cancelled', 0, 0])
})

test('with tasks mounted, a run cancelled by its signal is recorded as failed, not left running', async () => {
  const root = await boot()
  const events: string[] = []
  const task = (kind: string) => ({
    id: kind,
    signal: new AbortController().signal,
    progress() {},
    complete: () => void events.push(`${kind} complete`),
    fail: (error: unknown) => void events.push(`${kind} fail ${String(error)}`),
  })
  root.provide('tasks', { start: (kind: string) => task(kind) })
  root.model.complete = () => new Promise(() => {})
  const stop = new AbortController()
  const run = root.agent.run('slow', { signal: stop.signal })
  setTimeout(() => stop.abort(), 10)
  assert.equal((await run).status, 'cancelled')
  assert.deepEqual(events, ['agent-run fail the run was cancelled'])
})

test('with a tools list, a run sees only those tools and a call to any other fails', async () => {
  const root = new Context()
  for (const plugin of [model, tools, memory]) await root.plugin(plugin).await()
  await root.plugin(agent, { tools: ['look'] }).await()
  let seen: string[] = []
  scripted(root.model)?.teach(({ step, tools: offered }) => {
    seen = (offered ?? []).map((tool) => tool.name)
    return step === 0 ? { tool: 'add', input: [1, 1] } : { text: 'stopped' }
  })
  const result = await root.agent.run('add 1 1')
  assert.deepEqual(seen, [])
  assert.equal(result.trace[0]?.error, 'no tool named "add" is allowed in this run')
})

test('two runs at once each keep their own budget and both finish', async () => {
  const root = new Context()
  for (const plugin of [model, tools, memory]) await root.plugin(plugin).await()
  await root.plugin(agent).await()
  const release: Array<() => void> = []
  // The first step of each run waits until both runs are inside their own fiber.
  scripted(root.model)?.teach(({ step, question }) =>
    step === 0 ? undefined : { text: `done ${question}` },
  )
  const slow = root.model.complete
  root.model.complete = (input) =>
    input.step === 0
      ? new Promise((done) => release.push(() => done({ tool: 'add', input: [1, 2] })))
      : slow(input)
  const first = root.agent.run('one')
  const second = root.agent.run('two')
  // Bounded: a second run that could not start never reaches its first step.
  for (let waited = 0; release.length < 2 && waited < 2000; waited += 5)
    await new Promise((done) => setTimeout(done, 5))
  for (const go of release) go()
  const [a, b] = await Promise.allSettled([first, second])
  assert.deepEqual(
    [a, b].map((settled) =>
      settled.status === 'fulfilled' ? settled.value.status : String(settled.reason),
    ),
    ['completed', 'completed'],
  )
})

test('with answerAfter, an answer right after an act gets a look first, and the model answers from what it shows', async () => {
  const root = new Context()
  for (const plugin of [model, tools, memory]) await root.plugin(plugin).await()
  await root.plugin(agent, { answerAfter: 'look' }).await()
  let shown = 'all'
  root.tools.register('look', { description: 'the page', run: async () => `filter: ${shown}` })
  root.tools.register('act', {
    description: 'change it',
    run: async () => {
      shown = 'week'
      return 'done'
    },
  })
  scripted(root.model)?.teach(({ question, step, toolResult }) => {
    if (question === 'say hi') return { text: 'hi' }
    // Acts, then answers at once, as a weak model does; the second answer comes after the agent's look.
    return step === 0
      ? { tool: 'act', input: {} }
      : { text: `answered after ${JSON.stringify(toolResult)}` }
  })
  const result = await root.agent.run('filter it')
  assert.equal(result.status === 'completed' && result.output, 'answered after "filter: week"')
  assert.deepEqual(
    result.trace.map((call) => call.tool),
    ['act', 'look'],
  )
  // An answer with no call before it needs no look.
  assert.deepEqual(await root.agent.run('say hi'), {
    status: 'completed',
    output: 'hi',
    steps: 1,
    trace: [],
  })
})

test('with answerAfter, the agent looks once per answer: a model that answers again after the look is taken', async () => {
  const root = new Context()
  for (const plugin of [model, tools, memory]) await root.plugin(plugin).await()
  await root.plugin(agent, { answerAfter: 'look' }).await()
  root.tools.register('look', {
    description: 'the page',
    run: () => Promise.reject(new Error('no page')),
  })
  root.tools.register('act', { description: 'change it', run: async () => 'done' })
  scripted(root.model)?.teach(({ step }) =>
    step === 0 ? { tool: 'act', input: {} } : { text: 'done anyway' },
  )
  const result = await root.agent.run('go')
  assert.deepEqual(
    [result.status, result.steps, result.trace.map((call) => call.tool)],
    ['completed', 3, ['act', 'look']],
  )
})
