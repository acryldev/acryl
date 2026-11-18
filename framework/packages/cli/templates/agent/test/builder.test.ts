import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { pinnedInstance, withPort } from '../plugins/instance/index.ts'
import { createApp } from '../src/app.ts'

/** The plugin this test has the agent build: a name of its own, so a route the app has (a person's /hello) can never shadow it and fail the template's tests. */
const NAME = `builder-probe-${randomBytes(3).toString('hex')}`

/** Throwaway homes live inside the project (`.acrylblends/` is ignored by git): a sandboxed agent may not write to the system temp folder. */
const scratch = join(fileURLToPath(new URL('..', import.meta.url)), '.acrylblends', 'test')
mkdirSync(scratch, { recursive: true })

/** The agent extends the running app through POST /ask; a restart keeps what it built. */
test('the agent builds, updates, protects and removes a plugin in the running app, and a restart keeps it', async () => {
  const project = await mkdtemp(join(scratch, 'builder-project-'))
  const chosen = withPort(pinnedInstance(join(project, '.acrylblends'), { root: project }), 0)
  let app = await createApp(chosen, { listen: false })
  const ask = async (question: string) => {
    const response = await app.root.router.request(`/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question }),
    })
    return ((await response.json()) as { output: string }).output
  }
  const served = async () => {
    const response = await app.root.router.request(`/${NAME}`)
    return response.status === 200
      ? ((await response.json()) as { text: string }).text
      : response.status
  }
  try {
    assert.equal(await ask(`create route ${NAME} /${NAME} Hello`), `${NAME}: installed, active.`)
    assert.equal(await served(), 'Hello')
    assert.equal(await ask(`update route ${NAME} /${NAME} Bonjour`), `${NAME}: updated, active.`)
    assert.equal(await served(), 'Bonjour')
    assert.match(await ask(`break plugin ${NAME}`), /Previous version restored: true/)
    assert.equal(await served(), 'Bonjour')

    // The broken version stays on disk, so put the working one back before restarting.
    await ask(`update route ${NAME} /${NAME} Bonjour`)
    await app.stop()
    app = await createApp(chosen, { listen: false })
    assert.equal(await served(), 'Bonjour')

    assert.equal(await ask(`remove plugin ${NAME}`), `${NAME}: done.`)
    assert.equal(await served(), 404)

    // Every run is a durable task that owns its tool calls, and the records survived the restart.
    const records = (await (await app.root.router.request(`/tasks`)).json()) as Array<{
      kind: string
      status: string
      parent?: string
    }>
    const runs = records.filter((record) => record.kind === 'agent-run')
    assert.equal(runs.length, 5)
    assert.ok(runs.every((run) => run.status === 'completed'))
    assert.ok(
      records.some(
        (record) => record.kind === 'tool:install_plugin' && record.parent !== undefined,
      ),
    )
  } finally {
    await app.stop()
    await rm(project, { recursive: true, force: true })
  }
})

test('with approval on, an install waits for the owner; approving it makes it live', async () => {
  const project = await mkdtemp(join(scratch, 'approval-project-'))
  const chosen = withPort(pinnedInstance(join(project, '.acrylblends'), { root: project }), 0)
  const app = await createApp(chosen, { values: { approval: true }, listen: false })
  const post = async (path: string, body: unknown) =>
    (await (
      await app.root.router.request(`${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    ).json()) as Record<string, unknown>
  try {
    assert.equal(
      (await post('/ask', { question: `create route ${NAME} /${NAME} Hello` })).output,
      `${NAME}: waiting for the owner's approval.`,
    )
    assert.equal((await app.root.router.request(`/${NAME}`)).status, 404)
    const listed = (await (await app.root.router.request(`/extensions`)).json()) as {
      waitingForApproval: Array<{ name: string }>
    }
    assert.deepEqual(
      listed.waitingForApproval.map((request) => request.name),
      [NAME],
    )
    assert.equal(
      ((await post('/extensions/approve', { name: NAME })) as { state?: string }).state,
      'active',
    )
    assert.deepEqual(await (await app.root.router.request(`/${NAME}`)).json(), { text: 'Hello' })
    const tasks = (await (await app.root.router.request(`/tasks`)).json()) as Array<{
      manifest?: string
    }>
    assert.ok(
      tasks.length > 0 && tasks.every((task) => /^sha256:[0-9a-f]{64}$/.test(task.manifest ?? '')),
    )
  } finally {
    await app.stop()
    await rm(project, { recursive: true, force: true })
  }
})

test('the agent builds a sandboxed tool, calls it, and the sandbox refuses a tool that reads outside its folder', async () => {
  const project = await mkdtemp(join(scratch, 'tool-project-'))
  const chosen = withPort(pinnedInstance(join(project, '.acrylblends'), { root: project }), 0)
  const app = await createApp(chosen, { listen: false })
  const ask = async (question: string) =>
    (
      (await (
        await app.root.router.request(`/ask`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ question }),
        })
      ).json()) as { output: string }
    ).output
  try {
    assert.equal(await ask('create tool triple 3'), 'triple: installed, active.')
    assert.equal(await ask('run tool triple 14'), '{"n":42}')
    const refused = await ask('spy tool snoop')
    assert.match(refused, /^Refused: its check failed: denied:/)
    const listed = (await (await app.root.router.request(`/extensions`)).json()) as {
      installed: Array<{ name: string }>
    }
    assert.deepEqual(
      listed.installed.map((extension) => extension.name),
      ['triple'],
    )
  } finally {
    await app.stop()
    await rm(project, { recursive: true, force: true })
  }
})

test('what happens is streamed from the state cells: the run as a task, and the install as an extension', async () => {
  const project = await mkdtemp(join(scratch, 'events-project-'))
  const chosen = withPort(pinnedInstance(join(project, '.acrylblends'), { root: project }), 0)
  const app = await createApp(chosen, { listen: false })
  const controller = new AbortController()
  /** Follow one server-sent stream: its text so far. */
  const follow = async (path: string) => {
    const stream = await app.root.router.request(`${path}`, { signal: controller.signal })
    assert.equal(stream.status, 200, path)
    const reader = stream.body!.getReader()
    const decoder = new TextDecoder()
    const seen = { text: '' }
    const pump = (async () => {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) return
        seen.text += decoder.decode(value, { stream: true })
      }
    })().catch(() => undefined)
    return { seen, pump, reader }
  }
  try {
    const tasksStream = await follow('/api/state/tasks/events')
    const extensionsStream = await follow('/api/state/extensions/events')
    await app.root.router.request(`/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: `create route ${NAME} /${NAME} Hello` }),
    })
    const arrived = (stream: { text: string }, what: RegExp) => what.test(stream.text)
    for (
      let waited = 0;
      waited < 3000 &&
      !arrived(extensionsStream.seen, new RegExp(`"name":"${NAME}"[^\\n]*"state":"active"`));
      waited += 25
    ) {
      await new Promise((done) => setTimeout(done, 25))
    }
    assert.ok(
      arrived(tasksStream.seen, /event: value\ndata: \[\]/),
      'the stream starts with the current value',
    )
    assert.ok(
      arrived(tasksStream.seen, /"kind":"agent-run"[^\n]*"status":"running"/) ||
        arrived(tasksStream.seen, /"kind":"agent-run"/),
      'the run is a task',
    )
    assert.ok(arrived(tasksStream.seen, /"kind":"tool:install_plugin"/), 'the install is a task')
    assert.ok(
      arrived(extensionsStream.seen, new RegExp(`"name":"${NAME}"[^\\n]*"state":"active"`)),
      'the extension is reported',
    )
    // In process there is no socket to close: the readers are cancelled, which ends the streams and lets the pumps finish.
    controller.abort()
    await Promise.all([tasksStream.reader.cancel(), extensionsStream.reader.cancel()]).catch(
      () => undefined,
    )
    await Promise.all([tasksStream.pump, extensionsStream.pump])
  } finally {
    await app.stop()
    await rm(project, { recursive: true, force: true })
  }
})
