# acryl-todo

The reference app of the ACRYL Framework: a todo list in one plugin (about 90 lines in `src/index.ts` plus a 30-line page). It uses only `router` and `state`.

```ts
export const inject = ['router', 'state']
export function apply(ctx: Context, config: { file?: string } = {}): void {
  const todos = ctx.state.cell('todo.list', load(config.file))          // the list is a cell
  const api = ctx.router.group('/todo', loopbackOnly({ inProcess: 'allow' }))
  api.post('/api', validate('json', NewTodo), c => { /* ... */ })        // validated body
  api.get('/events', c => streamSSE(c, stream => todos.subscribe(list => stream.send(list))))
}
```

- `GET /todo` the page, `GET/POST /todo/api`, `PATCH/DELETE /todo/api/:id`, `GET /todo/events` (server-sent events). Also `GET /api/state/todo.list` through `acryl-state`.
- Pass `config.file` to keep the list across restarts (atomic write on every change); without it the list lives in memory. A missing file is a new list; a corrupt or unreadable one stops the plugin with an error naming the file and is never overwritten.
- Tests (`tests/todo.spec.ts`) run it with no socket and prove the restart: a second context on the same file sees the list.

Try it with curl (no `Origin` header needed; a browser page from another origin is refused):

```sh
curl -X POST -H 'content-type: application/json' -d '{"title":"hello"}' http://127.0.0.1:<port>/todo/api
```
