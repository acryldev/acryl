import assert from 'node:assert/strict'
import test from 'node:test'
import { GtdError, agenda, byStatus, capture, complete, emptyState, itemsForProject, projects, triage, upcoming } from '../lib/domain.js'

test('capture puts a new item straight into the inbox', () => {
  let state = capture(emptyState(), { title: 'Renew passport' })
  assert.deepEqual(byStatus(state, 'inbox').map(item => item.title), ['Renew passport'])
  assert.equal(byStatus(state, 'next').length, 0)
})

test('a title is required; a due date must be a real day', () => {
  assert.throws(() => capture(emptyState(), { title: '  ' }), /title is required/)
  assert.throws(() => capture(emptyState(), { title: 'x', due: '2026-13-40' }), /not a day/)
})

test('triage is the one decision: pick exactly one bucket, optionally a project and a due date', () => {
  let state = capture(emptyState(), { title: 'Book flights' })
  state = triage(state, { id: 1, status: 'next', project: 'Trip to Berlin', due: '2026-10-05' })
  const [item] = byStatus(state, 'next')
  assert.equal(item.project, 'Trip to Berlin')
  assert.equal(item.due, '2026-10-05')
  assert.equal(byStatus(state, 'inbox').length, 0)
})

test('triaging as done completes it directly (done is a status, not a separate call)', () => {
  let state = capture(emptyState(), { title: 'Quick thing' })
  state = triage(state, { id: 1, status: 'done' })
  assert.equal(byStatus(state, 'done')[0].status, 'done')
  assert.ok(byStatus(state, 'done')[0].doneAt)
})

test('an unknown item or an unknown bucket is refused', () => {
  assert.throws(() => triage(emptyState(), { id: 1, status: 'next' }), /no item #1/)
  const state = capture(emptyState(), { title: 'x' })
  assert.throws(() => triage(state, { id: 1, status: 'lost' }), GtdError)
})

test('complete marks a next action or waiting-for item done, and refuses an unknown id', () => {
  let state = capture(emptyState(), { title: 'Call the bank' })
  state = triage(state, { id: 1, status: 'waiting' })
  state = complete(state, 1)
  assert.equal(byStatus(state, 'waiting').length, 0)
  assert.equal(byStatus(state, 'done').length, 1)
  assert.throws(() => complete(state, 99), /no item #99/)
})

test('projects summarize open and done counts across triaged items', () => {
  let state = capture(emptyState(), { title: 'Design the deck' })
  state = triage(state, { id: 1, status: 'next', project: 'Launch' })
  state = capture(state, { title: 'Book the venue' })
  state = triage(state, { id: 2, status: 'done', project: 'Launch' })
  assert.deepEqual(projects(state), [{ project: 'Launch', open: 1, done: 1 }])
  assert.deepEqual(itemsForProject(state, 'Launch').map(item => item.id), [1, 2])
})

test('the agenda lists what is due on one day, next actions before waiting before someday', () => {
  let state = capture(emptyState(), { title: 'Someday idea', due: '2026-10-01' })
  state = triage(state, { id: 1, status: 'someday' })
  state = capture(state, { title: 'Waiting on Sam', due: '2026-10-01' })
  state = triage(state, { id: 2, status: 'waiting' })
  state = capture(state, { title: 'File taxes', due: '2026-10-01' })
  state = triage(state, { id: 3, status: 'next' })
  assert.deepEqual(agenda(state, '2026-10-01').map(item => item.title), ['File taxes', 'Waiting on Sam', 'Someday idea'])
})

test('a done or trashed item drops off the agenda even with a matching due date', () => {
  let state = capture(emptyState(), { title: 'Old thing', due: '2026-10-01' })
  state = triage(state, { id: 1, status: 'done' })
  assert.equal(agenda(state, '2026-10-01').length, 0)
})

test('upcoming groups by day across a window and skips empty days', () => {
  let state = capture(emptyState(), { title: 'Day one', due: '2026-10-01' })
  state = triage(state, { id: 1, status: 'next' })
  state = capture(state, { title: 'Day three', due: '2026-10-03' })
  state = triage(state, { id: 2, status: 'next' })
  const days = upcoming(state, '2026-10-01', 5)
  assert.deepEqual(days.map(day => day.day), ['2026-10-01', '2026-10-03'])
  assert.equal(days[0].items[0].title, 'Day one')
})
