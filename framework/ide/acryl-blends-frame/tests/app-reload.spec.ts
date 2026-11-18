import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppReloader, describeError, isNoise, watchFolder, watchFolders, type AppRow } from '../src/app-reload.ts'
import { appRowsOf } from '../src/index.ts'
import { parseAppReloadView } from '../src/contract.ts'

/** A row that records what it was asked, under which generation. */
function fakeRow(id: string, log: string[], generation: { current: number }, options: { loadFails?: () => Error | undefined; restartFails?: () => Error | undefined } = {}): AppRow {
  return {
    id,
    load: async () => {
      log.push(`${id}.load@${String(generation.current)}`)
      const failure = options.loadFails?.()
      if (failure !== undefined) throw failure
    },
    restart: async () => {
      log.push(`${id}.restart@${String(generation.current)}`)
      const failure = options.restartFails?.()
      if (failure !== undefined) throw failure
    },
  }
}

function reloaderOf(rows: (log: string[], generation: { current: number }) => AppRow[]) {
  const log: string[] = []
  const generation = { current: 0 }
  const reported: unknown[] = []
  const reloader = new AppReloader({
    generation: { current: () => generation.current, set: (next) => { generation.current = next } },
    rows: () => rows(log, generation),
    report: (cause) => { reported.push(cause) },
  })
  return { reloader, log, generation, reported }
}

describe('AppReloader', () => {
  it('loads every row under a new generation before it stops any, then starts them in order', async () => {
    const { reloader, log, generation } = reloaderOf((l, g) => [fakeRow('plugins', l, g), fakeRow('routes', l, g)])
    expect(reloader.view()).toEqual({ seq: 0, generation: 0, error: null })
    await reloader.reload()
    expect(log).toEqual(['plugins.load@1', 'routes.load@1', 'plugins.restart@1', 'routes.restart@1'])
    expect(generation.current).toBe(1)
    expect(reloader.view()).toEqual({ seq: 1, generation: 1, error: null })
  })

  it('keeps the running app and says why when the new code does not load', async () => {
    let broken: Error | undefined = new SyntaxError('Expression expected')
    const { reloader, log, generation, reported } = reloaderOf((l, g) => [fakeRow('routes', l, g, { loadFails: () => broken })])
    await reloader.reload()
    // Nothing was stopped, the generation is back where the running code is, and the error is the view's.
    expect(log).toEqual(['routes.load@1'])
    expect(generation.current).toBe(0)
    expect(reloader.view()).toEqual({ seq: 1, generation: 0, error: 'Expression expected' })
    expect(reported).toHaveLength(1)
    // The next change that loads clears the error; its generation is a number no failed attempt used.
    broken = undefined
    await reloader.reload()
    expect(generation.current).toBe(2)
    expect(reloader.view()).toEqual({ seq: 2, generation: 1, error: null })
  })

  it('puts the last good code back when a row does not start from the new one', async () => {
    let starts = 0
    const { reloader, log, generation } = reloaderOf((l, g) => [
      fakeRow('plugins', l, g),
      // The first start under the new generation fails; the restart of the old code (generation 0) works.
      fakeRow('routes', l, g, { restartFails: () => (g.current === 1 && ++starts === 1 ? new Error('ReferenceError: nope is not defined') : undefined) }),
    ])
    await reloader.reload()
    expect(log).toEqual(['plugins.load@1', 'routes.load@1', 'plugins.restart@1', 'routes.restart@1', 'plugins.restart@0', 'routes.restart@0'])
    expect(generation.current).toBe(0)
    expect(reloader.view()).toEqual({ seq: 1, generation: 0, error: 'ReferenceError: nope is not defined' })
  })

  it('runs once more, never twice at once, for a change that arrives while it reloads', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    let loads = 0
    let running = 0
    let overlapped = false
    const { reloader } = reloaderOf((_l, _g) => [{
      id: 'routes',
      load: async () => {
        loads += 1
        running += 1
        if (running > 1) overlapped = true
        if (loads === 1) await gate
        running -= 1
      },
      restart: async () => {},
    }])
    const first = reloader.reload()
    await Promise.resolve()
    void reloader.reload()
    void reloader.reload()
    release()
    await first
    expect(loads).toBe(2)
    expect(overlapped).toBe(false)
    expect(reloader.view().generation).toBe(2)
  })

  it('does nothing for an app with no rows', async () => {
    const { reloader, generation } = reloaderOf(() => [])
    await reloader.reload()
    expect(generation.current).toBe(0)
    expect(reloader.view().seq).toBe(0)
  })

  describe('wait', () => {
    afterEach(() => { vi.useRealTimers() })

    it('answers at once when the caller is behind', async () => {
      const { reloader } = reloaderOf((l, g) => [fakeRow('routes', l, g)])
      await reloader.reload()
      await expect(reloader.wait(0, 60_000)).resolves.toEqual({ seq: 1, generation: 1, error: null })
    })

    it('holds the answer until the view changes, and every waiter hears it', async () => {
      const { reloader } = reloaderOf((l, g) => [fakeRow('routes', l, g)])
      const a = reloader.wait(0, 60_000)
      const b = reloader.wait(0, 60_000)
      await reloader.reload()
      await expect(a).resolves.toMatchObject({ seq: 1, generation: 1 })
      await expect(b).resolves.toMatchObject({ seq: 1, generation: 1 })
    })

    it('answers with the unchanged view when the time is up', async () => {
      vi.useFakeTimers()
      const { reloader } = reloaderOf((l, g) => [fakeRow('routes', l, g)])
      const answer = reloader.wait(0, 25_000)
      await vi.advanceTimersByTimeAsync(25_000)
      await expect(answer).resolves.toEqual({ seq: 0, generation: 0, error: null })
    })
  })
})

describe('describeError', () => {
  const root = '/work/app'

  it('names the file and line of the app that the stack points at, then the reason', () => {
    const cause = new SyntaxError('Expression expected')
    cause.stack = 'SyntaxError: Expression expected\n    at compile (file:///work/app/src/board/card.ts?gen=3:12:4)'
    expect(describeError(cause, root)).toBe('src/board/card.ts:12 Expression expected')
    cause.stack = 'SyntaxError: Expression expected\n    at compile (/work/app/src/board/card.ts:7:1)'
    expect(describeError(cause, root)).toBe('src/board/card.ts:7 Expression expected')
  })

  it('does not take the frame\'s own or a plugin\'s src/ for the app\'s', () => {
    const cause = new Error('nope')
    cause.stack = 'Error: nope\n    at restart (/elsewhere/frame/src/app-reload.ts:110:9)\n    at x (/work/app/plugins/p/src/index.ts:3:3)'
    expect(describeError(cause, root)).toBe('nope')
  })

  it('keeps the first line of a message with no place in it', () => {
    expect(describeError(new Error('Cannot find module x\nrequire stack:\n- y'), root)).toBe('Cannot find module x')
    expect(describeError('plain text')).toBe('plain text')
  })

  it('cuts a very long line', () => {
    expect(describeError(new Error('x'.repeat(1000)), root).length).toBe(300)
  })
})

describe('isNoise', () => {
  it('ignores an editor\'s swap and backup files and hidden paths, and nothing of the code', () => {
    for (const name of ['routes.ts~', '.routes.ts.swp', 'x.tmp', '.git/index', 'board/.DS_Store']) expect(isNoise(name)).toBe(true)
    for (const name of ['routes.ts', 'board/card.tsx', 'page.html']) expect(isNoise(name)).toBe(false)
  })
})

describe('watchFolders', () => {
  it('hears each folder and stops them all', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'watch-folders-'))
    const src = join(dir, 'src')
    const plugins = join(dir, 'plugins')
    mkdirSync(src)
    mkdirSync(join(plugins, 'board'), { recursive: true })
    let calls = 0
    const stop = watchFolders([src, plugins, join(dir, 'missing')], () => { calls += 1 }, { debounceMs: 10 })
    await new Promise(resolve => setTimeout(resolve, 400))
    writeFileSync(join(plugins, 'board', 'index.ts'), 'export {}')
    await vi.waitFor(() => { expect(calls).toBe(1) }, { timeout: 3000 })
    writeFileSync(join(src, 'routes.ts'), 'export {}')
    await vi.waitFor(() => { expect(calls).toBe(2) }, { timeout: 3000 })
    stop()
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('watchFolder', () => {
  const folders: string[] = []
  afterEach(() => {
    for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
  })

  const waitFor = async (condition: () => boolean, ms = 3000): Promise<void> => {
    const until = Date.now() + ms
    while (!condition() && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 20))
  }

  it('calls back once for a burst of writes under the folder, subfolders included', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'watch-folder-'))
    folders.push(dir)
    mkdirSync(join(dir, 'board'))
    let calls = 0
    const stop = watchFolder(dir, () => { calls += 1 }, { debounceMs: 400 })
    await new Promise(resolve => setTimeout(resolve, 350))
    writeFileSync(join(dir, 'a.ts'), '1')
    writeFileSync(join(dir, 'board/b.ts'), '2')
    writeFileSync(join(dir, 'a.ts'), '3')
    await waitFor(() => calls > 0)
    await new Promise(resolve => setTimeout(resolve, 800))
    stop()
    expect(calls).toBe(1)
  })

  it('hears only the named files at the top of the folder when `only` is given (the app root\'s blend.yaml)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'watch-folder-'))
    folders.push(dir)
    mkdirSync(join(dir, 'node_modules'))
    let calls = 0
    const stop = watchFolder(dir, () => { calls += 1 }, { debounceMs: 50, only: ['blend.yaml'] })
    await new Promise(resolve => setTimeout(resolve, 350))
    writeFileSync(join(dir, 'README.md'), 'x')
    writeFileSync(join(dir, 'node_modules', 'blend.yaml'), 'x')
    await new Promise(resolve => setTimeout(resolve, 300))
    expect(calls).toBe(0)
    writeFileSync(join(dir, 'blend.yaml'), 'spec: {}\n')
    await waitFor(() => calls > 0)
    stop()
    expect(calls).toBe(1)
  })

  it('does not call back after it is stopped, and watches nothing for a folder that is not there', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'watch-folder-'))
    folders.push(dir)
    let calls = 0
    const stop = watchFolder(dir, () => { calls += 1 }, { debounceMs: 50 })
    await new Promise(resolve => setTimeout(resolve, 350))
    stop()
    writeFileSync(join(dir, 'a.ts'), '1')
    await new Promise(resolve => setTimeout(resolve, 250))
    expect(calls).toBe(0)
    expect(watchFolder(join(dir, 'missing'), () => { calls += 1 })).toBeTypeOf('function')
  })
})

describe('appRowsOf', () => {
  /** The loader entry's parts the rows use: a fiber with its plugin, the registry, and the loader's own import and init. */
  function entry(id: string, options: { disabled?: boolean; importFails?: boolean; fiberFails?: boolean } = {}) {
    const imports: string[] = []
    const removed: unknown[] = []
    const callback = (): void => {}
    const fiberOf = (plugin: unknown) => ({ runtime: { callback: plugin }, await: vi.fn(async () => { if (options.fiberFails === true) throw new Error('apply failed') }) })
    const row = {
      options: { id, name: `./${id}.ts` },
      disabled: options.disabled === true,
      getOuterStack: () => [],
      ctx: { registry: { delete: vi.fn((plugin: unknown) => { removed.push(plugin) }) } },
      parent: { tree: { import: vi.fn(async (name: string) => { imports.push(name); if (options.importFails === true) throw new SyntaxError('bad') }) } },
      fiber: fiberOf(callback) as ReturnType<typeof fiberOf> | undefined,
      init: vi.fn(async () => { if (options.importFails !== true) row.fiber = fiberOf(() => {}) }),
    }
    return { row, imports, removed, callback }
  }
  const loaderOf = (...rows: ReturnType<typeof entry>[]) => ({ entries: () => rows.map(item => item.row) })

  it('finds the app\'s rows by id, plugins first, and leaves out one that is off or missing', () => {
    const rows = appRowsOf(loaderOf(entry('app-routes'), entry('other'), entry('app-plugins')) as never)
    expect(rows.map(row => row.id)).toEqual(['app-plugins', 'app-routes'])
    expect(appRowsOf(loaderOf(entry('app-routes', { disabled: true })) as never)).toEqual([])
    expect(appRowsOf(undefined)).toEqual([])
  })

  it('loads the module by the row\'s own name', async () => {
    const routes = entry('app-routes')
    const [row] = appRowsOf(loaderOf(routes) as never)
    await row?.load()
    expect(routes.imports).toEqual(['./app-routes.ts'])
  })

  it('restarts by taking the plugin out of the registry and starting the entry again, never by disposing its fiber', async () => {
    const routes = entry('app-routes')
    const [row] = appRowsOf(loaderOf(routes) as never)
    const old = routes.row.fiber
    await row?.restart()
    // Disposing a fiber the loader did not stop is read as the row switched off, and written into the app's cordis.yml.
    expect(routes.removed).toEqual([routes.callback])
    expect(routes.row.init).toHaveBeenCalledTimes(1)
    expect(routes.row.fiber).not.toBe(old)
  })

  it('rejects when the module cannot be loaded or the new fiber fails to start', async () => {
    const broken = entry('app-routes', { importFails: true })
    const [loadRow] = appRowsOf(loaderOf(broken) as never)
    await expect(loadRow?.load()).rejects.toThrow('bad')
    // The loader logs a failed import and keeps the old fiber: a row that did not start.
    await expect(loadRow?.restart()).rejects.toThrow('could not be loaded')
    const crashing = entry('app-routes')
    const [startRow] = appRowsOf(loaderOf(crashing) as never)
    crashing.row.init.mockImplementation(async () => {
      crashing.row.fiber = { runtime: { callback: () => {} }, await: vi.fn(async () => { throw new Error('apply failed') }) }
    })
    await expect(startRow?.restart()).rejects.toThrow('apply failed')
  })
})

describe('parseAppReloadView', () => {
  it('reads the Host\'s answer and names the field that is wrong', () => {
    expect(parseAppReloadView({ seq: 3, generation: 2, error: null })).toEqual({ seq: 3, generation: 2, error: null })
    expect(parseAppReloadView({ seq: 3, generation: 2, error: 'src/a.ts:1 bad' }).error).toBe('src/a.ts:1 bad')
    expect(() => parseAppReloadView({ seq: -1, generation: 0, error: null })).toThrow('seq')
    expect(() => parseAppReloadView({ seq: 0, generation: 1.5, error: null })).toThrow('generation')
    expect(() => parseAppReloadView({ seq: 0, generation: 0, error: 4 })).toThrow('error')
    expect(() => parseAppReloadView('x')).toThrow('not an object')
  })
})
