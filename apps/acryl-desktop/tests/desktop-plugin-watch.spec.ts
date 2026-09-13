import type { FSWatcher } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installPluginWatchers, parsePluginWatchSpec } from '../src/desktop-plugin-watch.ts'

afterEach(() => { vi.useRealTimers() })

describe('parsePluginWatchSpec', () => {
  it('parses absolute package=dir pairs and drops malformed or duplicate ones', () => {
    expect(parsePluginWatchSpec('acryl-editor=/abs/one, other=/abs/two')).toEqual([
      { packageName: 'acryl-editor', directory: '/abs/one' },
      { packageName: 'other', directory: '/abs/two' },
    ])
    expect(parsePluginWatchSpec('rel=not/absolute,noeq,=/abs,pkg=,dup=/a,dup=/b')).toEqual([
      { packageName: 'dup', directory: '/a' },
    ])
    expect(parsePluginWatchSpec(undefined)).toEqual([])
    expect(parsePluginWatchSpec('   ')).toEqual([])
  })
})

describe('installPluginWatchers', () => {
  it('debounces file events and restarts by package name', async () => {
    vi.useFakeTimers()
    const listeners = new Map<string, () => void>()
    const closed: string[] = []
    const fakeWatcher = (dir: string, listener: () => void): FSWatcher => {
      listeners.set(dir, listener)
      return { close: () => { closed.push(dir) } } as unknown as FSWatcher
    }
    const reload = vi.fn(async () => {})
    const onError = vi.fn()

    const dispose = installPluginWatchers(
      [{ packageName: 'acryl-editor', directory: '/abs/one' }],
      reload,
      onError,
      fakeWatcher,
    )

    listeners.get('/abs/one')!()
    listeners.get('/abs/one')!()
    listeners.get('/abs/one')!()
    expect(reload).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(200)
    expect(reload).toHaveBeenCalledExactlyOnceWith('acryl-editor')

    dispose()
    expect(closed).toEqual(['/abs/one'])
  })

  it('reports a reload rejection without tearing the watcher down', async () => {
    vi.useFakeTimers()
    let fire!: () => void
    const reload = vi.fn(async () => { throw new Error('module broke') })
    const onError = vi.fn()
    installPluginWatchers(
      [{ packageName: 'p', directory: '/abs' }],
      reload,
      onError,
      (_dir, listener) => { fire = listener; return { close: () => {} } as unknown as FSWatcher },
    )
    fire()
    await vi.advanceTimersByTimeAsync(200)
    expect(onError).toHaveBeenCalledExactlyOnceWith('p', expect.any(Error))
  })
})
