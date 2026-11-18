import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { generationUrl } from '../src/app-generation.ts'

describe('generationUrl', () => {
  const scopes = ['file:///app/src/', 'file:///app/frame/']

  it('leaves the files as they are while the generation is 0', () => {
    expect(generationUrl('file:///app/src/routes.ts', scopes, 0)).toBe('file:///app/src/routes.ts')
  })

  it('gives a file of the app the generation as its query', () => {
    expect(generationUrl('file:///app/src/board/card.ts', scopes, 3)).toBe('file:///app/src/board/card.ts?gen=3')
    expect(generationUrl('file:///app/frame/app-plugins.mjs', scopes, 1)).toBe('file:///app/frame/app-plugins.mjs?gen=1')
  })

  it('leaves everything outside the app\'s own folders a single instance', () => {
    expect(generationUrl('file:///app/node_modules/zod/index.js', scopes, 3)).toBe('file:///app/node_modules/zod/index.js')
    expect(generationUrl('file:///app/plugins/acryl-router/src/index.ts', scopes, 3)).toBe('file:///app/plugins/acryl-router/src/index.ts')
    expect(generationUrl('file:///app/srcs/x.ts', scopes, 3)).toBe('file:///app/srcs/x.ts')
    expect(generationUrl('node:fs', scopes, 3)).toBe('node:fs')
  })

  it('does not add a second query', () => {
    expect(generationUrl('file:///app/src/a.ts?gen=2', scopes, 3)).toBe('file:///app/src/a.ts?gen=2')
  })

  it('gives the app\'s own plugins the generation, and keeps the library copies single instances', () => {
    const plugins = { scope: 'file:///app/plugins/', library: new Set(['acryl-router', 'home']) }
    expect(generationUrl('file:///app/plugins/notes/index.ts', scopes, 2, plugins)).toBe('file:///app/plugins/notes/index.ts?gen=2')
    expect(generationUrl('file:///app/plugins/notes/lib/store.ts', scopes, 2, plugins)).toBe('file:///app/plugins/notes/lib/store.ts?gen=2')
    expect(generationUrl('file:///app/plugins/acryl-router/src/index.ts', scopes, 2, plugins)).toBe('file:///app/plugins/acryl-router/src/index.ts')
    expect(generationUrl('file:///app/plugins/home/index.ts', scopes, 2, plugins)).toBe('file:///app/plugins/home/index.ts')
    expect(generationUrl('file:///app/plugins/library.json', scopes, 2, plugins)).toBe('file:///app/plugins/library.json')
    expect(generationUrl('file:///app/plugins/notes/index.ts', scopes, 0, plugins)).toBe('file:///app/plugins/notes/index.ts')
  })
})

describe('the hook in a real process', () => {
  const folders: string[] = []
  afterEach(() => {
    for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
  })

  /** Node's own loader runs the hook, so it is driven in a child process (the test runner's module system would not apply it). */
  function run(app: string, script: string): string[] {
    const hook = pathToFileURL(join(import.meta.dirname, '../src/app-generation.ts')).href
    const program = `
      import { writeFileSync } from 'node:fs'
      const { installAppGeneration } = await import(${JSON.stringify(hook)})
      const generation = installAppGeneration({ appRoot: ${JSON.stringify(app)} })
      const load = async () => import(${JSON.stringify(pathToFileURL(join(app, 'src/a.ts')).href)})
      ${script}
    `
    return execFileSync(process.execPath, ['--input-type=module', '-e', program], { encoding: 'utf8' }).trim().split('\n')
  }

  function makeApp(): string {
    const app = mkdtempSync(join(tmpdir(), 'app-generation-'))
    folders.push(app)
    mkdirSync(join(app, 'src'))
    mkdirSync(join(app, 'lib'))
    writeFileSync(join(app, 'src/a.ts'), "import { b } from './b.ts'\nimport { shared } from '../lib/shared.ts'\nexport const a: string = `a+${b}`\nexport { shared }\n")
    writeFileSync(join(app, 'src/b.ts'), "export const b: string = 'one'\n")
    writeFileSync(join(app, 'lib/shared.ts'), 'export const shared = { id: Math.random() }\n')
    return app
  }

  it('loads a file and everything it imports again under a new generation, and nothing outside src/', () => {
    const app = makeApp()
    const out = run(app, `
      const first = await load()
      writeFileSync(${JSON.stringify(join(app, 'src/b.ts'))}, "export const b: string = 'two'\\n")
      const same = await load()
      generation.set(1)
      const second = await load()
      console.log(first.a, same.a, second.a, first.shared === second.shared)
    `)
    // The first load is under no query; without a new generation the same copy is served; a new generation reads b.ts again; lib/ stays one instance.
    expect(out).toEqual(['a+one a+one a+two true'])
  })

  it('reports a syntax error of the new code and loads the next generation once it is fixed', () => {
    const app = makeApp()
    const out = run(app, `
      await load()
      writeFileSync(${JSON.stringify(join(app, 'src/b.ts'))}, 'export const b: string = (\\n')
      generation.set(1)
      try { await load() } catch (error) { console.log('refused', error.name) }
      generation.set(0)
      console.log((await load()).a)
      writeFileSync(${JSON.stringify(join(app, 'src/b.ts'))}, "export const b: string = 'three'\\n")
      generation.set(2)
      console.log((await load()).a)
    `)
    expect(out).toEqual(['refused SyntaxError', 'a+one', 'a+three'])
  })

  it('hands back the same switch when it is installed twice', () => {
    const app = makeApp()
    const out = run(app, `
      const again = installAppGeneration({ appRoot: ${JSON.stringify(app)} })
      generation.set(4)
      console.log(again === generation, again.current())
    `)
    expect(out).toEqual(['true 4'])
  })
})
