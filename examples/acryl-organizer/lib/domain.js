/**
 * The organizer's domain: to-dos, meetings and the calendar rules. Pure, no I/O, no framework: everything here works on plain
 * data so it can be tested without ACRYL, and the store and the tools are thin adapters around it.
 *
 * Ubiquitous language: a Todo is something to do (optionally due on a day); a Meeting is a booked time slot; the Calendar is the
 * set of Meetings and refuses a booking that overlaps another. Times are ISO-8601 with an offset or `Z`; a day is `YYYY-MM-DD`.
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/u
const MAX_TITLE = 200
const MAX_MINUTES = 24 * 60

export class OrganizerError extends Error {}

export function emptyState() {
  return { nextId: 1, todos: [], meetings: [] }
}

function title(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (text === '') throw new OrganizerError('a title is required')
  if (text.length > MAX_TITLE) throw new OrganizerError(`the title is too long (max ${MAX_TITLE})`)
  return text
}

function day(value) {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || !DAY.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new OrganizerError(`"${String(value)}" is not a day (use YYYY-MM-DD)`)
  return value
}

function instant(value, field) {
  const ms = typeof value === 'string' ? Date.parse(value) : Number.NaN
  if (Number.isNaN(ms)) throw new OrganizerError(`${field} must be an ISO-8601 date and time such as 2026-10-01T14:00:00Z`)
  return ms
}

/** Returns a new state with one more Todo. */
export function addTodo(state, input) {
  const todo = { id: state.nextId, title: title(input.title), due: day(input.due), done: false }
  return { ...state, nextId: state.nextId + 1, todos: [...state.todos, todo] }
}

export function completeTodo(state, id) {
  const found = state.todos.find(todo => todo.id === id)
  if (!found) throw new OrganizerError(`there is no to-do ${id}`)
  if (found.done) throw new OrganizerError(`to-do ${id} is already done`)
  return { ...state, todos: state.todos.map(todo => todo.id === id ? { ...todo, done: true } : todo) }
}

export function openTodos(state) {
  return state.todos.filter(todo => !todo.done)
}

/** The meeting a proposed slot would collide with, if any. Back-to-back meetings do not collide. */
export function conflictWith(state, startMs, endMs) {
  return state.meetings.find(meeting => startMs < Date.parse(meeting.end) && Date.parse(meeting.start) < endMs)
}

/** Books a Meeting, or throws naming the meeting it collides with. */
export function bookMeeting(state, input) {
  const startMs = instant(input.start, 'start')
  const minutes = Number(input.minutes ?? 30)
  if (!Number.isInteger(minutes) || minutes <= 0 || minutes > MAX_MINUTES) throw new OrganizerError(`minutes must be a whole number from 1 to ${MAX_MINUTES}`)
  const endMs = startMs + minutes * 60_000
  const clash = conflictWith(state, startMs, endMs)
  if (clash) throw new OrganizerError(`that slot overlaps meeting ${clash.id} "${clash.title}" (${clash.start} to ${clash.end})`)
  const meeting = {
    id: state.nextId,
    title: title(input.title),
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
    ...(typeof input.with === 'string' && input.with.trim() !== '' ? { with: input.with.trim() } : {}),
  }
  return { ...state, nextId: state.nextId + 1, meetings: [...state.meetings, meeting] }
}

export function cancelMeeting(state, id) {
  if (!state.meetings.some(meeting => meeting.id === id)) throw new OrganizerError(`there is no meeting ${id}`)
  return { ...state, meetings: state.meetings.filter(meeting => meeting.id !== id) }
}

/** What is on a given day (UTC): the meetings in time order, and the open to-dos due that day. */
export function agenda(state, dayValue) {
  const wanted = day(dayValue)
  if (wanted === undefined) throw new OrganizerError('a day is required')
  return {
    day: wanted,
    meetings: state.meetings.filter(meeting => meeting.start.startsWith(wanted)).sort((a, b) => a.start.localeCompare(b.start)),
    todos: openTodos(state).filter(todo => todo.due === wanted),
  }
}

/** The free slots of at least `minutes` inside working hours (UTC, default 09:00 to 17:00) on a day. */
export function freeSlots(state, dayValue, minutes = 30, from = '09:00', to = '17:00') {
  const wanted = day(dayValue)
  if (wanted === undefined) throw new OrganizerError('a day is required')
  const windowStart = Date.parse(`${wanted}T${from}:00Z`)
  const windowEnd = Date.parse(`${wanted}T${to}:00Z`)
  const busy = state.meetings
    .map(meeting => [Date.parse(meeting.start), Date.parse(meeting.end)])
    .filter(([start, end]) => end > windowStart && start < windowEnd)
    .sort((a, b) => a[0] - b[0])
  const slots = []
  let cursor = windowStart
  for (const [start, end] of busy) {
    if (start - cursor >= minutes * 60_000) slots.push({ start: new Date(cursor).toISOString(), end: new Date(start).toISOString() })
    cursor = Math.max(cursor, end)
  }
  if (windowEnd - cursor >= minutes * 60_000) slots.push({ start: new Date(cursor).toISOString(), end: new Date(windowEnd).toISOString() })
  return slots
}
