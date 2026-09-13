import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { apply, name } from '../src/hello-world.ts'

describe('ACRYL Hello World Host plugin', () => {
  it('loads through the ordinary Cordis apply contract', () => {
    const info = vi.fn()
    const ctx = {
      logger: { info },
    } as unknown as Context

    apply(ctx)

    expect(name).toBe('acryl-hello-world')
    expect(info).toHaveBeenCalledOnce()
    expect(info).toHaveBeenCalledWith('[acryl/hello-world] plugin loaded through Cordis')
  })
})
