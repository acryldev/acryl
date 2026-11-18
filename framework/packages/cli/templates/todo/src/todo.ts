/**
 * The reference app of the ACRYL Framework: a todo list in one plugin. It needs `router` and `state`, keeps the list in a cell, serves
 * JSON CRUD plus a page, and writes the list to a file so it survives a restart. Nothing else.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { Acryl, HTTPException } from '../plugins/acryl-router/src/index.ts'
import { bodyLimit, loopbackOnly, trimTrailingSlash } from '../plugins/acryl-router/src/middleware/index.ts'
import { schemaValidator, streamSSE, type StandardSchema } from '../plugins/acryl-router/src/helpers/index.ts'
import type {} from '../plugins/acryl-state/src/index.ts'
import { pageHtml } from './page.ts'

/** Stable Cordis plugin name, equal to the package name and the Loader row id. */
export const name = 'acryl-todo'
export const inject = ['router', 'state']

/**
 * The only place the app's mount prefix is named: the app answers under `/todo` on its own server (`npm start`), and the ACRYL frame mounts the same app
 * at `/app` (`npm run dev`). Every URL the page writes is derived from the prefix it is mounted at, so both are served by one source.
 */
export const FRAME_MOUNT_PREFIX = '/app'

export interface Todo { id: number, title: string, done: boolean }
export interface Config {
  file?: string
  /**
   * The path the app is mounted at, and the base of every URL its page writes. `/todo` on the app's own server (and the default); the ACRYL frame passes
   * `/app` so the same app answers at the frame's app prefix, with nothing else of its URLs moved.
   */
  prefix?: string
}

/** Standard Schema for the body of a new todo, written by hand so the example has no schema library. */
const NewTodo: StandardSchema<{ title: string }> = {
  '~standard': {
    validate: value => {
      const title = (value as { title?: unknown } | null)?.title
      return typeof title === 'string' && title.trim() !== '' && title.length <= 200
        ? { value: { title: title.trim() } }
        : { issues: [{ message: 'title must be 1 to 200 characters', path: ['title'] }] }
    },
  },
}

/** Standard Schema for a change to a todo. */
const TodoChange: StandardSchema<{ done: boolean }> = {
  '~standard': {
    validate: value => {
      const done = (value as { done?: unknown } | null)?.done
      return typeof done === 'boolean' ? { value: { done } } : { issues: [{ message: 'done must be true or false', path: ['done'] }] }
    },
  },
}

/** A todo body is small; anything bigger is refused before it is read. */
const MAX_BODY_BYTES = 16 * 1024

/** A missing file is a new list. Any other failure (unreadable, corrupt, half-written) refuses to start: starting empty would overwrite the user's real list on the first save. */
function load(file: string | undefined): Todo[] {
  if (file === undefined) return []
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw new Error(`acryl-todo: cannot read ${file}: ${(error as Error).message}`, { cause: error })
  }
  try {
    const parsed: unknown = JSON.parse(text)
    if (!Array.isArray(parsed)) throw new Error('not a list')
    return parsed as Todo[]
  } catch (error) {
    throw new Error(`acryl-todo: ${file} is not a valid todo list (${(error as Error).message}); fix or remove it, it was left untouched`, { cause: error })
  }
}

function save(file: string, todos: readonly Todo[]): void {
  mkdirSync(dirname(file), { recursive: true })
  const temporary = `${file}.tmp`
  writeFileSync(temporary, JSON.stringify(todos))
  renameSync(temporary, file)
}

export function apply(ctx: Context, config: Config = {}): void {
  const prefix = config.prefix ?? '/todo'
  const todos = ctx.state.cell<readonly Todo[]>('todo.list', load(config.file))
  if (config.file !== undefined) {
    const file = config.file
    ctx.effect(() => todos.subscribe(list => { save(file, list) }), 'acryl-todo: save to file')
  }
  const nextId = (): number => todos.get().reduce((max, todo) => Math.max(max, todo.id), 0) + 1

  const find = (id: number): Todo => {
    const todo = todos.get().find(item => item.id === id)
    if (todo === undefined) throw new HTTPException(404, { message: 'no such todo' })
    return todo
  }

  // `/todo/` is what people type: trimTrailingSlash answers a GET for an unknown path ending in `/` with a 301 to the path without it,
  // so the page is found either way while each route keeps one canonical path (the router itself treats `/a` and `/a/` as different).
  const api = new Acryl()
    .use(loopbackOnly({ inProcess: 'allow' }), bodyLimit({ maxSize: MAX_BODY_BYTES }), trimTrailingSlash())
    .get('/', c => c.html(pageHtml(prefix)))
    .get('/api', c => c.json(todos.get()))
    .post('/api', schemaValidator('json', NewTodo), c => {
      const todo: Todo = { id: nextId(), title: c.req.valid('json').title, done: false }
      todos.update(list => [...list, todo])
      return c.json(todo, 201)
    })
    .patch('/api/:id', schemaValidator('json', TodoChange), c => {
      const { id } = find(Number(c.req.param('id')))
      const { done } = c.req.valid('json')
      todos.update(list => list.map(todo => todo.id === id ? { ...todo, done } : todo))
      return c.json(find(id))
    })
    .delete('/api/:id', c => {
      const { id } = find(Number(c.req.param('id')))
      todos.update(list => list.filter(todo => todo.id !== id))
      return c.body(null, 204)
    })
    .get('/events', c => streamSSE(c, async stream => {
      const ended = new Promise<void>(resolve => { stream.onAbort(resolve) })
      // Writes are asynchronous; chaining them keeps events in the order the list changed.
      let queue: Promise<unknown> = Promise.resolve()
      const send = (list: readonly Todo[]): void => { queue = queue.then(() => stream.writeSSE({ data: JSON.stringify(list) })).catch(() => {}) }
      send(todos.get())
      const unsubscribe = todos.subscribe(send)
      try {
        await ended
      } finally {
        unsubscribe()
      }
    }))
  ctx.router.route(prefix === '' ? '/' : prefix, api)
}
