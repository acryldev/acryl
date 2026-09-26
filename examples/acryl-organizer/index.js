/**
 * acryl-organizer: a to-do list, a calendar and meeting booking, grown from the Blank Blueprint as one ordinary Cordis plugin.
 * Tools the agent calls on the user's behalf; the data lives in `<workspace>/.acryl/organizer.json`. Remove the plugin and the
 * tools go; the data file stays with the project.
 *
 * Surfaces: tui web desktop (tools need no browser). Requires: `tools`.
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import * as domain from './lib/domain.js'
import { storeFor } from './lib/store.js'

export const name = 'acryl-organizer'
export const inject = ['tools']

const text = (_args, value) => [{ type: 'text', text: value }]
const output = { schema: { type: 'string' }, render: text }

/** One use case = one tool: load, apply a domain rule, save, describe the result. */
function useCase(definition, run) {
  return defineTool({
    ...definition,
    output,
    async execute(args, exec) {
      const store = storeFor(exec)
      const state = store.load()
      try {
        return run(state, args, store)
      } catch (error) {
        if (error instanceof domain.OrganizerError) throw new Error(error.message)
        throw error
      }
    },
  })
}

const list = items => items.length === 0 ? '(none)' : items.join('\n')
const todoLine = todo => `#${todo.id} ${todo.done ? '[x]' : '[ ]'} ${todo.title}${todo.due ? ` (due ${todo.due})` : ''}`
const meetingLine = meeting => `#${meeting.id} ${meeting.start} to ${meeting.end} ${meeting.title}${meeting.with ? ` with ${meeting.with}` : ''}`

export function apply(ctx) {
  const tools = [
    useCase({ name: 'todo_add', description: 'Add a to-do, optionally due on a day.', parameters: { title: { type: 'string', required: true, description: 'What to do' }, due: { type: 'string', description: 'Due day, YYYY-MM-DD' } } },
      (state, args, store) => { const next = domain.addTodo(state, args); store.save(next); return `Added ${todoLine(next.todos.at(-1))}` }),
    useCase({ name: 'todo_list', description: 'List the open to-dos (pass all=true for done ones too).', parameters: { all: { type: 'boolean', description: 'Include done to-dos' } } },
      (state, args) => list((args.all === true ? state.todos : domain.openTodos(state)).map(todoLine))),
    useCase({ name: 'todo_done', description: 'Mark a to-do done.', parameters: { id: { type: 'number', required: true, description: 'To-do number' } } },
      (state, args, store) => { store.save(domain.completeTodo(state, Number(args.id))); return `Done: to-do ${args.id}` }),
    useCase({ name: 'meeting_book', description: 'Book a meeting. Refuses a slot that overlaps another meeting.', parameters: { title: { type: 'string', required: true, description: 'Meeting title' }, start: { type: 'string', required: true, description: 'ISO-8601 start, e.g. 2026-10-01T14:00:00Z' }, minutes: { type: 'number', description: 'Length in minutes (default 30)' }, with: { type: 'string', description: 'Who it is with' } } },
      (state, args, store) => { const next = domain.bookMeeting(state, args); store.save(next); return `Booked ${meetingLine(next.meetings.at(-1))}` }),
    useCase({ name: 'meeting_cancel', description: 'Cancel a meeting.', parameters: { id: { type: 'number', required: true, description: 'Meeting number' } } },
      (state, args, store) => { store.save(domain.cancelMeeting(state, Number(args.id))); return `Cancelled meeting ${args.id}` }),
    useCase({ name: 'calendar_agenda', description: 'What is on a day: meetings in time order and to-dos due that day.', parameters: { day: { type: 'string', required: true, description: 'YYYY-MM-DD' } } },
      (state, args) => { const a = domain.agenda(state, args.day); return `Agenda ${a.day}\nMeetings:\n${list(a.meetings.map(meetingLine))}\nDue:\n${list(a.todos.map(todoLine))}` }),
    useCase({ name: 'calendar_free_slots', description: 'Free slots on a day inside working hours (09:00 to 17:00 UTC).', parameters: { day: { type: 'string', required: true, description: 'YYYY-MM-DD' }, minutes: { type: 'number', description: 'Minimum length in minutes (default 30)' } } },
      (state, args) => list(domain.freeSlots(state, args.day, args.minutes === undefined ? 30 : Number(args.minutes)).map(slot => `${slot.start} to ${slot.end}`))),
  ]
  for (const tool of tools) ctx.effect(() => ctx.tools.register(tool), `acryl-organizer: ${tool.name}`)
}
