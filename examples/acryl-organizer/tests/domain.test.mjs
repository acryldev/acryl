import assert from 'node:assert/strict'
import test from 'node:test'
import { OrganizerError, addTodo, agenda, bookMeeting, cancelMeeting, completeTodo, emptyState, freeSlots, openTodos } from '../lib/domain.js'

const book = (state, start, minutes = 30, title = 'Sync') => bookMeeting(state, { title, start, minutes })

test('to-dos: add, complete once, list only the open ones', () => {
  let state = addTodo(emptyState(), { title: 'Buy milk', due: '2026-10-01' })
  state = addTodo(state, { title: 'Call Sam' })
  state = completeTodo(state, 1)
  assert.deepEqual(openTodos(state).map(todo => todo.title), ['Call Sam'])
  assert.throws(() => completeTodo(state, 1), OrganizerError)
  assert.throws(() => completeTodo(state, 99), /no to-do 99/)
})

test('a title and a real day are required', () => {
  assert.throws(() => addTodo(emptyState(), { title: '  ' }), /title is required/)
  assert.throws(() => addTodo(emptyState(), { title: 'x', due: '2026-13-40' }), /not a day/)
})

test('a meeting that overlaps another is refused, back-to-back is fine', () => {
  let state = book(emptyState(), '2026-10-01T14:00:00Z', 60)
  assert.throws(() => book(state, '2026-10-01T14:30:00Z'), /overlaps meeting 1/)
  state = book(state, '2026-10-01T15:00:00Z')
  assert.equal(state.meetings.length, 2)
})

test('a cancelled meeting frees its slot', () => {
  let state = book(emptyState(), '2026-10-01T14:00:00Z')
  state = cancelMeeting(state, 1)
  assert.equal(book(state, '2026-10-01T14:00:00Z').meetings.length, 1)
})

test('bad times and lengths are rejected', () => {
  assert.throws(() => book(emptyState(), 'tomorrow'), /ISO-8601/)
  assert.throws(() => book(emptyState(), '2026-10-01T14:00:00Z', 0), /minutes/)
})

test('the agenda lists the day in time order with the to-dos due', () => {
  let state = book(emptyState(), '2026-10-01T15:00:00Z', 30, 'Later')
  state = book(state, '2026-10-01T09:00:00Z', 30, 'Early')
  state = addTodo(state, { title: 'File taxes', due: '2026-10-01' })
  const day = agenda(state, '2026-10-01')
  assert.deepEqual(day.meetings.map(meeting => meeting.title), ['Early', 'Later'])
  assert.deepEqual(day.todos.map(todo => todo.title), ['File taxes'])
})

test('free slots are the gaps inside working hours', () => {
  let state = book(emptyState(), '2026-10-01T10:00:00Z', 60)
  state = book(state, '2026-10-01T13:00:00Z', 120)
  const slots = freeSlots(state, '2026-10-01', 60)
  assert.deepEqual(slots.map(slot => [slot.start.slice(11, 16), slot.end.slice(11, 16)]), [['09:00', '10:00'], ['11:00', '13:00'], ['15:00', '17:00']])
})
