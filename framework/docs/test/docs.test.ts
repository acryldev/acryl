import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const docs = join(root, 'docs')
/** Every page under docs/, as a path like `agent/extending-apps.md`. docs/framework is the framework's own text. */
const allPages = (dir = ''): string[] =>
  readdirSync(join(docs, dir), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? allPages(join(dir, entry.name))
      : entry.name.endsWith('.md')
        ? [join(dir, entry.name)]
        : [],
  )
const everyPage = allPages()
const pages = everyPage.filter((name) => !name.startsWith('framework'))
const read = (name: string) => readFileSync(join(docs, name), 'utf8')
const markdown = [
  ...pages.map((name) => ({ name, text: read(name) })),
  { name: '../README.md', text: readFileSync(join(root, 'README.md'), 'utf8') },
]
const linked = [
  ...markdown,
  ...everyPage
    .filter((name) => name.startsWith('framework'))
    .map((name) => ({ name, text: read(name) })),
]

/** `cordis` as installed for the templates, so the snippets run against the version the templates pin. */
const cordis = pathToFileURL(
  createRequire(join(root, 'packages', 'cli', 'package.json')).resolve('@deepseek-ai/cordis'),
).href

describe('docs', () => {
  it('links every page from the index', () => {
    const index = read('README.md')
    for (const page of pages.filter((name) => name !== 'README.md'))
      expect(index).toContain(`(${page})`)
    expect(index).toContain('(framework/README.md)')
  })

  it('has no broken relative links', () => {
    for (const { name, text } of linked) {
      for (const [, target] of text.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
        if (/^[a-z]+:/.test(target as string)) continue
        // A picture is written as the site serves it (/docs-assets/<folder>/<file>); the file is docs/plans/site-assets/<folder>/<file>.
        const file = (target as string).startsWith('/docs-assets/')
          ? resolve(docs, 'plans', 'site-assets', (target as string).slice('/docs-assets/'.length))
          : resolve(docs, dirname(name), target as string)
        expect(() => readFileSync(file), `${name} -> ${target}`).not.toThrow()
      }
    }
  })

  it('mentions none of the removed runtime', () => {
    for (const { name, text } of markdown) {
      // `@acrylblends/` used to name a removed runtime; since the owner's naming decision (2026-10-31) it is the scope the frame's packages publish
      // under (docs/plans/frame-publish.md), so the scope itself is allowed and the other names stay forbidden.
      expect(text, name).not.toMatch(
        /hookable|unplugin|effect-ts|definePlugin|createApp\(\{ plugins/i,
      )
      expect(text, name).not.toContain(String.fromCharCode(0x2014)) // no em dash
    }
  })
})

describe('docs: Cordis examples run', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'acrylblends-docs-'))
  afterAll(() => rmSync(scratch, { recursive: true, force: true }))
  const snippets = [...read('cordis.md').matchAll(/```js\n([\s\S]*?)```/g)].map(
    (match) => match[1] as string,
  )

  it('has examples', () => expect(snippets.length).toBeGreaterThanOrEqual(6))

  it.each(snippets.map((code, index) => [index + 1, code] as const))(
    'example %i',
    async (index, code) => {
      const file = join(scratch, `example-${index}.mjs`)
      writeFileSync(file, code.replaceAll("from '@deepseek-ai/cordis'", `from '${cordis}'`))
      await import(pathToFileURL(file).href)
    },
  )
})

describe('docs: the extension contract in agent/extending-apps.md', () => {
  it('installs through the real extensions plugin and passes its own check', async () => {
    const { Context } = await import('@deepseek-ai/cordis')
    const { instance, pinnedInstance } = await import('../../plugins/instance/index.ts')
    const { extensions } = await import('../../plugins/extensions/index.ts')
    const block = /<!-- extension: hello -->\n```ts\n([\s\S]*?)```/.exec(
      read('agent/extending-apps.md'),
    )?.[1]
    expect(block).toBeTruthy()
    const project = mkdtempSync(join(tmpdir(), 'acrylblends-docs-ext-'))
    try {
      const folder = join(project, 'extensions', 'hello')
      mkdirSync(folder, { recursive: true })
      writeFileSync(join(folder, 'index.ts'), block as string)
      const app = new Context()
      app.provide('greeting', 'hi')
      await app.plugin(instance, pinnedInstance(join(project, '.acrylblends'), { root })).await()
      const fiber = app.plugin(extensions, {
        sources: [{ dir: join(project, 'extensions'), trust: 'list' }],
      })
      await fiber.await()
      const result = await app.extensions.install(folder)
      expect(result).toMatchObject({
        ok: true,
        name: 'hello',
        action: 'installed',
        state: 'active',
      })
      expect(app.get('hello')).toBe('hi, world')
      await fiber.dispose()
    } finally {
      rmSync(project, { recursive: true, force: true })
    }
  })

  it('names one plugin folder, plugins/: no page tells a reader to use src/plugins/ or extensions/', () => {
    // A page may say the old folders are gone or give the move; any other mention is a second folder.
    const allowed =
      /There is no `src\/plugins\/` and no `extensions\/`\.|Do not create `src\/plugins\/` or `extensions\/`\.|git mv (?:src\/plugins plugins|extensions\/<name> plugins\/<name>)|reads its `src\/plugins\/` and\s+`extensions\/`|the old folders?/gu
    const offenders = linked
      .filter(
        ({ name }) => !name.includes('release-notes') && !name.includes('docs-1-0-claim-audit'),
      )
      .flatMap(({ name, text }) =>
        text
          .replace(allowed, '')
          .split('\n')
          .flatMap((line, index) =>
            /(?:^|[^\w/@.-])(?:src\/plugins|extensions)\//u.test(line)
              ? [`${name}:${index + 1}: ${line.trim().slice(0, 100)}`]
              : [],
          ),
      )
    expect(offenders).toEqual([])
  })
})
