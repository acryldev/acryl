/**
 * GTD (Getting Things Done, David Allen) domain: capture everything into an inbox, triage each item into exactly one
 * bucket - next action, waiting for, someday/maybe, reference, or done - and read it back by bucket, by project, or
 * by day (calendar). Pure functions on plain data; no I/O, no framework. A fresh reimplementation for ACRYL's own
 * plugin conventions - not a port of any other GTD app's code.
 */

export class GtdError extends Error {
  constructor(message) {
    super(message)
    this.name = 'GtdError'
  }
}

/** Every bucket an item can be in. 'inbox' is not yet triaged; 'trash' is a triaged-away item, kept for history. */
export const STATUSES = ['inbox', 'next', 'waiting', 'someday', 'reference', 'done', 'trash']

export function emptyState() {
  return { items: [], nextId: 1 }
}

function requireTitle(title) {
  if (typeof title !== 'string' || title.trim() === '') throw new GtdError('a title is required')
  return title.trim()
}

function requireDay(day) {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) {
    throw new GtdError(`"${String(day)}" is not a day in YYYY-MM-DD form`)
  }
  return day
}

function findItem(state, id) {
  const item = state.items.find(candidate => candidate.id === id)
  if (item === undefined) throw new GtdError(`no item #${id}`)
  return item
}

function replaceItem(state, id, patch) {
  return { ...state, items: state.items.map(item => (item.id === id ? { ...item, ...patch } : item)) }
}

/** Capture: get it out of your head, into the inbox. Nothing is decided yet - not even whether it is actionable. */
export function capture(state, { title, note, due, tags }) {
  const item = {
    id: state.nextId,
    title: requireTitle(title),
    note: typeof note === 'string' && note.trim() !== '' ? note.trim() : undefined,
    status: 'inbox',
    project: undefined,
    due: due === undefined ? undefined : requireDay(due),
    tags: Array.isArray(tags) ? [...new Set(tags.map(String))] : [],
    createdAt: new Date().toISOString(),
    doneAt: undefined,
  }
  return { ...state, items: [...state.items, item], nextId: state.nextId + 1 }
}

/**
 * Triage: the one decision GTD asks for every inbox item - what bucket does it belong in. Also how the same
 * decision is revised later (move a next action to waiting, file it as reference instead, and so on).
 */
export function triage(state, { id, status, project, due, tags }) {
  const item = findItem(state, id)
  if (!STATUSES.includes(status)) throw new GtdError(`"${status}" is not a bucket (${STATUSES.join(', ')})`)
  const patch = { status }
  if (project !== undefined) patch.project = project.trim() === '' ? undefined : project.trim()
  if (due !== undefined) patch.due = due === null || due === '' ? undefined : requireDay(due)
  if (tags !== undefined) patch.tags = Array.isArray(tags) ? [...new Set(tags.map(String))] : item.tags
  if (status === 'done') patch.doneAt = new Date().toISOString()
  return replaceItem(state, id, patch)
}

/** Complete: a next action or a waiting-for item is done. Reference and someday items are filed, not completed. */
export function complete(state, id) {
  findItem(state, id)
  return replaceItem(state, id, { status: 'done', doneAt: new Date().toISOString() })
}

export function byStatus(state, status) {
  if (!STATUSES.includes(status)) throw new GtdError(`"${status}" is not a bucket (${STATUSES.join(', ')})`)
  return state.items.filter(item => item.status === status)
}

/** Every project name in use (from triaged items only - inbox items have not been assigned one yet), with counts. */
export function projects(state) {
  const byName = new Map()
  for (const item of state.items) {
    if (item.project === undefined) continue
    const entry = byName.get(item.project) ?? { project: item.project, open: 0, done: 0 }
    if (item.status === 'done') entry.done += 1
    else entry.open += 1
    byName.set(item.project, entry)
  }
  return [...byName.values()].sort((a, b) => a.project.localeCompare(b.project))
}

export function itemsForProject(state, project) {
  return state.items.filter(item => item.project === project)
}

/** What is due on one day: every non-done, non-trashed item whose due date matches, next actions first. */
export function agenda(state, day) {
  requireDay(day)
  const due = state.items.filter(item => item.due === day && item.status !== 'done' && item.status !== 'trash')
  const order = { next: 0, waiting: 1, inbox: 2, someday: 3, reference: 4 }
  return due.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.title.localeCompare(b.title))
}

/** The next `days` days (including `from`) with anything due, in day order. */
export function upcoming(state, from, days = 7) {
  requireDay(from)
  if (!Number.isInteger(days) || days < 1) throw new GtdError('days must be a positive integer')
  const start = new Date(`${from}T00:00:00Z`)
  const dueDays = new Set()
  for (let offset = 0; offset < days; offset += 1) {
    dueDays.add(new Date(start.getTime() + offset * 86_400_000).toISOString().slice(0, 10))
  }
  return [...dueDays].sort().map(day => ({ day, items: agenda(state, day) })).filter(day => day.items.length > 0)
}
