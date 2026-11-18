import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The templates, all Cordis apps: a web app with a page and a client component (nodejs), a notes app and a chat app on the db port (notes, chat), a blank app on the router, a todo list on the router and state, and the blank app with the offline agent. */
export const TEMPLATES = ['blank', 'nodejs', 'notes', 'chat', 'todo', 'agent'] as const
export type Template = (typeof TEMPLATES)[number]

/** One line per template: the single list `acrylblends init` and `create-acrylblends` both show (`create-acrylblends` tests that its own copy equals this one). */
export const TEMPLATE_SUMMARY: Record<(typeof TEMPLATES)[number], string> = {
  blank: 'the router, a server and one route: the smallest app',
  nodejs: 'a web app with a page and a client component',
  notes: 'a multi-user notes app on the db port (sign-up, log-in, sessions)',
  chat: 'a chat app that streams an answer over server-sent events',
  todo: 'a to-do list on the router and state',
  agent: 'the blank app with an offline agent that builds plugins into the running app',
}

/** Names that were templates once and still work: `create-acrylblends --template acryl-app` made the agent app. */
export const TEMPLATE_ALIASES: Record<string, Template> = { 'acryl-app': 'agent' }

export function isTemplate(value: string): value is Template {
  return (TEMPLATES as readonly string[]).includes(value)
}

/** The template a name means: itself, or what an old name stands for; undefined for anything else. */
export function resolveTemplate(value: string): Template | undefined {
  return isTemplate(value) ? value : TEMPLATE_ALIASES[value]
}

/**
 * The `templates/` folder of this package. The module sits at different depths in source (`src/`) and in the build
 * (`dist/`), so walk up until a `templates` folder holds the `blank` template.
 */
export function templatesRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (;;) {
    const candidate = join(dir, 'templates')
    if (existsSync(join(candidate, 'blank'))) return candidate
    const parent = dirname(dir)
    if (parent === dir) throw new Error('acrylblends cannot find its templates folder')
    dir = parent
  }
}

/** Absolute path of a template folder. */
export function templateDir(template: Template): string {
  return join(templatesRoot(), template)
}

/** The text every generated app's `AGENTS.md` starts with (`shared/`, beside `templates/`). */
export function sharedDir(): string {
  return join(dirname(templatesRoot()), 'shared')
}

/**
 * The framework's docs, as ACRYL wrote them: `docs/framework` of the repository, or the copy `prepack` puts inside the package. The module sits at
 * different depths in source and in the build, so walk up until a `docs/framework` folder holds the README.
 */
export function frameworkDocsRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (;;) {
    const candidate = join(dir, 'docs', 'framework')
    if (existsSync(join(candidate, 'README.md'))) return candidate
    const parent = dirname(dir)
    if (parent === dir)
      throw new Error('acrylblends cannot find the framework docs (docs/framework)')
    dir = parent
  }
}
