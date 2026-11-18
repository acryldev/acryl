/**
 * Data that survives a restart, kept in a JSON file in the app's home: a list of links with routes to list, add and remove them, and a home widget.
 *
 * The file lives in `ctx.appInstance.home` (`.acrylblends/` in the app folder, never committed), one file per plugin named after it. Every write
 * goes to a temporary file first and is renamed over the old one, so a crash never leaves half a file. The list is read once when the plugin
 * starts; the routes change the copy in memory and write it. User text is escaped before it goes into HTML.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from 'acrylblends'
import type {} from '../home/index.ts'
import type {} from '../instance/index.ts'

export const name = 'state-json-file'
export const inject = ['router', 'home', 'appInstance']

interface Link {
  readonly id: string
  readonly title: string
  readonly url: string
}

const escapeHtml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

function readLinks(file: string): Link[] {
  if (!existsSync(file)) return []
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
  return Array.isArray(parsed) ? (parsed as Link[]) : []
}

function writeLinks(file: string, links: readonly Link[]): void {
  mkdirSync(join(file, '..'), { recursive: true })
  const temporary = `${file}.${String(process.pid)}.tmp`
  writeFileSync(temporary, `${JSON.stringify(links, null, 2)}\n`)
  renameSync(temporary, file)
}

export function apply(ctx: Context): void {
  const file = join(ctx.appInstance.home, `${name}.json`)
  let links = readLinks(file)
  const app = new Acryl()
    .get('/items', (c) => c.json(links))
    .post('/items', async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as { title?: unknown; url?: unknown }
      const title = typeof body.title === 'string' ? body.title.trim() : ''
      const url = typeof body.url === 'string' ? body.url.trim() : ''
      if (title === '' || !/^https?:\/\//.test(url)) return c.json({ error: 'a link needs a title and an http(s) url' }, 400)
      const link = { id: crypto.randomUUID(), title, url }
      links = [...links, link]
      writeLinks(file, links)
      return c.json(link, 201)
    })
    .delete('/items/:id', (c) => {
      const id = c.req.param('id')
      if (!links.some((link) => link.id === id)) return c.json({ error: 'no such link' }, 404)
      links = links.filter((link) => link.id !== id)
      writeLinks(file, links)
      return c.body(null, 204)
    })
  ctx.router.route('/state-json-file', app)
  ctx.effect(() =>
    ctx.home.widget({
      id: 'state-json-file',
      title: 'Links',
      render: () => `<ul id="state-json-file-list">${links.map((link) => `<li><a href="${escapeHtml(link.url)}">${escapeHtml(link.title)}</a></li>`).join('')}</ul>
<form id="state-json-file-add">
  <input name="title" placeholder="Title" required>
  <input name="url" type="url" placeholder="https://..." required>
  <button type="submit">Add</button>
</form>
<script type="module">
  document.getElementById('state-json-file-add').addEventListener('submit', async (event) => {
    event.preventDefault()
    const form = new FormData(event.target)
    const response = await fetch('/state-json-file/items', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: form.get('title'), url: form.get('url') }),
    })
    if (response.ok) location.reload()
  })
</script>`,
    }),
  )
}
