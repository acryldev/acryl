import { doorEnabled } from './door.ts'

/**
 * The page: plain HTML and a few lines of script; it follows the list through the server-sent event stream. Every URL it writes is derived from
 * `prefix`, the path the app is mounted at (`/todo` on its own server, `/app` when the ACRYL frame hosts it), so the same page works under both.
 */
export const pageHtml = (prefix: string): string => `<!doctype html>
<meta charset="utf-8"><title>Todo</title>
<style>body{font:16px system-ui;max-width:32rem;margin:2rem auto}ul{list-style:none;padding:0}li{display:flex;gap:.5rem;padding:.25rem 0}.done span{text-decoration:line-through;opacity:.6}</style>
<h1>Todo</h1>
<form id="add"><input id="title" placeholder="What needs doing?" autofocus> <button>Add</button></form>
<ul id="list"></ul>
${doorEnabled() ? '<script type="module" src="/api/acryl-door/page.js"></script>' : ''}
<script>
const base = ${JSON.stringify(prefix)}
const list = document.getElementById('list')
const send = (url, method, body) => fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) })
document.getElementById('add').onsubmit = async event => {
  event.preventDefault()
  const input = document.getElementById('title')
  await send(base + '/api', 'POST', { title: input.value })
  input.value = ''
}
new EventSource(base + '/events').onmessage = event => {
  list.replaceChildren(...JSON.parse(event.data).map(todo => {
    const item = document.createElement('li')
    item.className = todo.done ? 'done' : ''
    const box = Object.assign(document.createElement('input'), { type: 'checkbox', checked: todo.done, onchange: () => send(base + '/api/' + todo.id, 'PATCH', { done: box.checked }) })
    const title = document.createElement('span'); title.textContent = todo.title
    const remove = Object.assign(document.createElement('button'), { textContent: 'x', onclick: () => send(base + '/api/' + todo.id, 'DELETE') })
    item.append(box, title, remove)
    return item
  }))
}
</script>`
