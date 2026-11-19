# State: data that survives a restart

A variable in `apply` lives as long as the plugin runs: it starts again at every reload in the frame, at every switch in Settings > Plugins and
at every start of the app. Data the person makes (notes, links, settings) must be kept in a file.

## A JSON file in the app's home

The app's home is `ctx.appInstance.home` (`.acrylblends/` in the app folder; git ignores it, so data is never committed with the code). Keep one
file per plugin, named after it:

```ts
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type {} from '../instance/index.ts'

export const inject = ['router', 'home', 'appInstance']

export function apply(ctx: Context): void {
  const file = join(ctx.appInstance.home, 'notes.json')
  let notes: Note[] = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : []
  const save = (): void => {
    mkdirSync(ctx.appInstance.home, { recursive: true })
    writeFileSync(`${file}.tmp`, JSON.stringify(notes, null, 2))
    renameSync(`${file}.tmp`, file)  // never half a file
  }
  // routes that change `notes` call save()
}
```

- Read the file once in `apply`; change the copy in memory and write the whole file after each change, through a temporary file and a rename.
- Validate what a request sends before you keep it (a 400 for a bad input), and escape it before it goes into HTML.
- Give every item an id (`crypto.randomUUID()`) so it can be changed or deleted by id.
- `inject` must list `appInstance`, and `import type {} from '../instance/index.ts'` types it.

Example: `../example-plugins/packages/state-json-file/` (a list kept in a file, with routes to list, add and delete, and a widget with a form).

## Other stores

A larger app can add a library plugin for its data: `npx acrylblends add acryl-state` (cells a page can follow live) or a database (see
`docs/framework/guides/data.md` in this app). Adding one is its own change: it puts a library copy in `plugins/` and its row in `blend.yaml`.
Do not add one for a feature a JSON file serves.
