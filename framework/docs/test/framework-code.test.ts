import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain module shared with the scripts
import { CLASS, NOT_YET_AVAILABLE, PACKAGE } from '../../scripts/lib/names.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
/** The framework docs: docs/framework, or another folder when a branch of the docs is being checked before it is synced. */
const docsRoot = resolve(process.env.FRAMEWORK_DOCS || join(root, 'docs', 'framework'))
const out = join(root, 'docs', '.generated', 'framework-code')

const pagesIn = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? pagesIn(join(dir, entry.name))
      : entry.name.endsWith('.md')
        ? [join(dir, entry.name)]
        : [],
  )

interface Block {
  strict: boolean
  worker: boolean
  page: string
  line: number
  code: string
  file: string
}

const unavailable = (specifier: string): boolean =>
  NOT_YET_AVAILABLE.some((name: string) => {
    const sub = specifier.slice(PACKAGE.length + 1)
    return sub === name || sub.startsWith(`${name}/`)
  })

/** In a fragment, these only say that a placeholder the page never defines is not defined (TS2304, TS2552) or that a callback parameter has no type (TS7006, TS7031, TS2503). */
const LOOSE_IGNORED = ['2304', '2552', '7006', '7031', '2503', '1108', '2687', '18004']

const requireFromRoot = createRequire(join(root, 'package.json'))
const resolvable = (specifier: string): boolean => {
  if (specifier.startsWith('node:') || specifier === PACKAGE || specifier.startsWith(`${PACKAGE}/`))
    return true
  if (/^[./@]/.test(specifier) && !specifier.startsWith('@')) return false
  try {
    requireFromRoot.resolve(specifier)
    return true
  } catch {
    return false
  }
}

/** The `ts` blocks that import the package, from the pages that are available. */
function extract(): { checked: Block[]; skipped: { page: string; line: number; why: string }[] } {
  const checked: Block[] = []
  const skipped: { page: string; line: number; why: string }[] = []
  for (const file of pagesIn(docsRoot)) {
    const page = relative(docsRoot, file)
    const text = readFileSync(file, 'utf8')
    if (/^> \*\*Not yet available\.\*\*/m.test(text.split('\n').slice(0, 6).join('\n'))) continue
    const lines = text.split('\n')
    let index = 0
    for (let i = 0; i < lines.length; i++) {
      const open = /^(\s*)```ts( twoslash| no-check| lib=webworker)?\s*$/.exec(lines[i] ?? '')
      if (!open) continue
      const start = i + 1
      const noCheck = open[2] === ' no-check'
      const body: string[] = []
      for (i++; i < lines.length && !/^\s*```\s*$/.test(lines[i] ?? ''); i++)
        body.push((lines[i] ?? '').replace(new RegExp(`^${open[1]}`), ''))
      const code = body.join('\n')
      const specifiers = [...code.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)].map(
        (m) => m[1] as string,
      )
      if (noCheck || !specifiers.some((s) => s === PACKAGE || s.startsWith(`${PACKAGE}/`))) continue
      const missing = specifiers.find((s) => unavailable(s))
      if (missing) {
        skipped.push({ page, line: start, why: `imports ${missing}, not yet available` })
        continue
      }
      const external = specifiers.find((s) => !resolvable(s))
      if (external) {
        skipped.push({ page, line: start, why: `imports ${external}, not installed here` })
        continue
      }
      const name = `${page.replace(/\.md$/, '').replaceAll('/', '__')}__${index++}.ts`
      checked.push({
        strict: open[2] === ' twoslash',
        worker: open[2] === ' lib=webworker',
        page,
        line: start,
        code,
        file: join(out, 'blocks', name),
      })
    }
  }
  return { checked, skipped }
}

describe('framework docs: code', () => {
  it('type-checks every code block that imports the package', () => {
    const { checked, skipped } = extract()
    rmSync(out, { recursive: true, force: true })
    mkdirSync(join(out, 'blocks'), { recursive: true })
    // The real package: the checked blocks resolve `acrylblends` through packages/cli's own exports map, as an installed app would.
    mkdirSync(join(out, 'node_modules'), { recursive: true })
    symlinkSync(join(root, 'packages', 'cli'), join(out, 'node_modules', PACKAGE), 'dir')
    for (const block of checked) writeFileSync(block.file, `${block.code}\nexport {}\n`)
    // Blocks that are not marked `twoslash` are fragments of a page (they use an `app` the text defines elsewhere): they are checked against ambient names, and the
    // errors that only say a placeholder is undefined are ignored. Everything else (a wrong import, a missing export, a method that does not exist) still fails.
    writeFileSync(
      join(out, 'blocks', 'ambient.d.ts'),
      `// The Cordis side of the docs (ctx.router, ctx.routerHttp) is the vendored acryl-router plugin's declaration of those services.\nimport type {} from '${join(root, 'plugins', 'acryl-router', 'src', 'index.ts')}'\ndeclare global {\n  const app: import('${PACKAGE}').${CLASS}<any, any, any>\n}\nexport {}\n`,
    )
    // A block that augments the package's interfaces (`declare module`) changes the types of every other block in the same program, so each one is checked alone.
    const augments = (block: Block) => /declare (module|global)/.test(block.code)
    // A block fenced ` ```ts lib=webworker ` is code for a Service Worker or a Worker: it is checked with the WebWorker library (and no DOM, no Node types), alone.
    // The pages about Cordis describe an app where `acrylblends` is the vendored acryl-router plugin (the app's tsconfig `paths`, taken from the agent template); the others are the
    // public package. The two classes are separate declarations, so a block is checked against the one its page is about.
    const inCordis = (b: Block) =>
      b.page.startsWith('cordis') ||
      b.page === join('api', 'summary.md') ||
      b.page.startsWith('agents')
    const appPaths = JSON.parse(
      readFileSync(join(root, 'packages', 'cli', 'templates', 'agent', 'tsconfig.json'), 'utf8'),
    ).compilerOptions.paths as Record<string, string[]>
    const pluginPaths: Record<string, string[]> = Object.fromEntries(
      Object.entries(appPaths).map(([key, targets]) => [
        key,
        targets.map((t) =>
          join(root, 'plugins', 'acryl-router', t.replace('./plugins/acryl-router/', '')),
        ),
      ]),
    )
    // The framework plugins by their package names (`acryl-state`, `acryl-router/middleware`): the source in plugins/, from each plugin's `entries`.
    for (const name of readdirSync(join(root, 'plugins')).filter((n) => n.startsWith('acryl-'))) {
      const manifest = join(root, 'plugins', name, 'plugin.json')
      if (!existsSync(manifest)) continue
      const entries =
        (JSON.parse(readFileSync(manifest, 'utf8')) as { entries?: Record<string, string> })
          .entries ?? {}
      for (const [subpath, file] of Object.entries(entries))
        pluginPaths[`${name}${subpath}`] = [join(root, 'plugins', name, file)]
    }
    const programs: {
      name: string
      blocks: Block[]
      paths: Record<string, string[]> | undefined
      worker?: boolean
    }[] = [
      {
        name: 'main',
        blocks: checked.filter((b) => !b.worker && !augments(b) && !inCordis(b)),
        paths: undefined,
      },
      {
        name: 'cordis',
        blocks: checked.filter((b) => !b.worker && !augments(b) && inCordis(b)),
        paths: pluginPaths,
      },
      ...checked
        .filter((b) => !b.worker && augments(b))
        .map((b) => ({ name: basename(b.file, '.ts'), blocks: [b], paths: undefined })),
      ...checked
        .filter((b) => b.worker)
        .map((b) => ({
          name: `worker-${basename(b.file, '.ts')}`,
          blocks: [b],
          paths: undefined,
          worker: true,
        })),
    ].filter((p) => p.blocks.length > 0)
    let output = ''
    for (const program of programs) {
      const config = join(out, `tsconfig.${program.name}.json`)
      writeFileSync(
        config,
        JSON.stringify({
          compilerOptions: {
            target: 'ES2024',
            lib: program.worker ? ['ES2024', 'WebWorker'] : ['ES2024', 'DOM', 'DOM.Iterable'],
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            strict: true,
            noEmit: true,
            skipLibCheck: true,
            allowImportingTsExtensions: true,
            esModuleInterop: true,
            types: program.worker ? [] : ['node'],
            typeRoots: [join(root, 'node_modules', '@types')],
            ...(program.paths ? { paths: program.paths } : {}),
          },
          files: [
            ...(program.worker ? [] : [join(out, 'blocks', 'ambient.d.ts')]),
            ...program.blocks.map((b) => b.file),
          ],
        }),
      )
      try {
        execFileSync(join(root, 'node_modules', '.bin', 'tsc'), ['-p', config], {
          encoding: 'utf8',
          stdio: 'pipe',
        })
      } catch (error) {
        output += `${(error as { stdout?: string }).stdout ?? String(error)}\n`
      }
    }
    const byFile = new Map(checked.map((b) => [b.file, b]))
    const problems = output
      .split('\n')
      .filter((line) => /error TS/.test(line))
      .map((line) => {
        const m = /^(.*?)\((\d+),\d+\): (error TS\d+: .*)$/.exec(line)
        const block = m ? byFile.get(resolve(m[1] as string)) : undefined
        return block && m
          ? {
              block,
              text: `${block.page}:${block.line + Number(m[2]) - 1} ${m[3]}`,
              code: /error TS(\d+)/.exec(m[3] as string)?.[1],
            }
          : { text: line, block: undefined, code: undefined }
      })
      .filter((p) => p.block !== undefined)
      .filter((p) => p.block?.strict !== false || !LOOSE_IGNORED.includes(p.code ?? ''))
      .map((p) => p.text)
    console.log(`framework docs: ${checked.length} blocks type-checked, ${skipped.length} skipped`)
    expect(checked.length).toBeGreaterThan(50)
    expect(problems.join('\n')).toBe('')
  }, 300_000)
})
