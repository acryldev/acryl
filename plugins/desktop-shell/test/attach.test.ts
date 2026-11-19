import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runningApp } from '../attach.ts'

const door = (value: unknown) => ({ read: () => JSON.stringify(value) })

test('attaches to a live dev server that answers on a loopback address', async () => {
  const found = await runningApp('/app', {
    ...door({ url: 'http://127.0.0.1:3712', pid: 42, secret: 'x' }),
    alive: () => true,
    answers: async () => true,
  })
  assert.deepEqual(found, { url: 'http://127.0.0.1:3712', pid: 42 })
})

test('does not attach when there is no door file, it is not JSON, or it lacks an address or pid', async () => {
  const yes = { alive: () => true, answers: async () => true }
  assert.equal(
    await runningApp('/app', {
      read: () => {
        throw new Error('ENOENT')
      },
      ...yes,
    }),
    undefined,
  )
  assert.equal(await runningApp('/app', { read: () => 'not json', ...yes }), undefined)
  assert.equal(await runningApp('/app', { ...door({ pid: 42 }), ...yes }), undefined)
  assert.equal(
    await runningApp('/app', { ...door({ url: 'http://127.0.0.1:1' }), ...yes }),
    undefined,
  )
  assert.equal(
    await runningApp('/app', { ...door({ url: 'http://127.0.0.1:1', pid: 'x' }), ...yes }),
    undefined,
  )
})

test('does not attach to a dead process, to nothing that answers, or to an address that is not loopback', async () => {
  assert.equal(
    await runningApp('/app', {
      ...door({ url: 'http://127.0.0.1:3712', pid: 42 }),
      alive: () => false,
      answers: async () => true,
    }),
    undefined,
  )
  assert.equal(
    await runningApp('/app', {
      ...door({ url: 'http://127.0.0.1:3712', pid: 42 }),
      alive: () => true,
      answers: async () => false,
    }),
    undefined,
  )
  for (const url of [
    'http://example.com:3712',
    'http://192.168.1.5:3712',
    'https://127.0.0.1:3712',
    'file:///etc/passwd',
  ])
    assert.equal(
      await runningApp('/app', {
        ...door({ url, pid: 42 }),
        alive: () => true,
        answers: async () => true,
      }),
      undefined,
      url,
    )
})

test('a real process is alive and a made-up pid is not (the default check)', async () => {
  const live = await runningApp('/app', {
    ...door({ url: 'http://127.0.0.1:1', pid: process.pid }),
    answers: async () => true,
  })
  assert.equal(live?.pid, process.pid)
  assert.equal(
    await runningApp('/app', {
      ...door({ url: 'http://127.0.0.1:1', pid: 2 ** 22 + 12345 }),
      answers: async () => true,
    }),
    undefined,
  )
})
