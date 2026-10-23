/**
 * The reference app of the ACRYL Framework: a todo list in one plugin. It needs `router` and `state`, keeps the list in a cell, serves
 * JSON CRUD plus a page, and writes the list to a file so it survives a restart. Nothing else.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { HttpError } from 'acryl-router'
import { loopbackOnly } from 'acryl-router/middleware'
import { readJson, streamSSE, valid, validate, type StandardSchema } from 'acryl-router/helpers'
import type {} from 'acryl-state'
import { PAGE } from './page.ts'

/** Stable Cordis plugin name, equal to the package name and the Loader row id. */
export const name = 'acryl-todo'
export const inject = ['router', 'state']

export interface Todo { id: number, title: string, done: boolean }
export interface Config { file?: string }

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

function load(file: string | undefined): Todo[] {
  if (file === undefined) return []
  try { return JSON.parse(readFileSync(file, 'utf8')) as Todo[] } catch { return [] }
}

function save(file: string, todos: readonly Todo[]): void {
  mkdirSync(dirname(file), { recursive: true })
  const temporary = `${file}.tmp`
  writeFileSync(temporary, JSON.stringify(todos))
  renameSync(temporary, file)
}

export function apply(ctx: Context, config: Config = {}): void {
  const todos = ctx.state.cell<readonly Todo[]>('todo.list', load(config.file))
  if (config.file !== undefined) {
    const file = config.file
    ctx.effect(() => todos.subscribe(list => { save(file, list) }), 'acryl-todo: save to file')
  }
  const nextId = (): number => todos.get().reduce((max, todo) => Math.max(max, todo.id), 0) + 1

  const api = ctx.router.group('/todo', loopbackOnly({ inProcess: 'allow' }))
  api.get('/', c => c.html(PAGE))
  api.get('/api', c => c.json(todos.get()))
  api.post('/api', validate('json', NewTodo), c => {
    const todo: Todo = { id: nextId(), title: valid<{ title: string }>(c, 'json').title, done: false }
    todos.update(list => [...list, todo])
    return c.json(todo, 201)
  })
  api.patch('/api/:id', async c => {
    const id = Number(c.param('id'))
    const change = await readJson(c) as { done?: unknown }
    if (!todos.get().some(todo => todo.id === id)) throw new HttpError(404, { message: 'no such todo' })
    if (typeof change.done !== 'boolean') throw new HttpError(400, { message: 'done must be true or false' })
    todos.update(list => list.map(todo => todo.id === id ? { ...todo, done: change.done as boolean } : todo))
    return c.json(todos.get().find(todo => todo.id === id))
  })
  api.delete('/api/:id', c => {
    const id = Number(c.param('id'))
    if (!todos.get().some(todo => todo.id === id)) throw new HttpError(404, { message: 'no such todo' })
    todos.update(list => list.filter(todo => todo.id !== id))
    return c.body(null, 204)
  })
  api.get('/events', c => streamSSE(c, stream => {
    stream.send(todos.get())
    return todos.subscribe(list => { stream.send(list) })
  }))

  ctx.inject(['routerHttp'], inner => { inner.routerHttp.mount('/todo') })
}
