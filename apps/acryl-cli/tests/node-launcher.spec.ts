import { describe, expect, it } from 'vitest'
import { exposedInternalsInvocation } from '../src/cli/node-launcher.ts'

describe('exposedInternalsInvocation', () => {
  it('restarts the same entrypoint under Node with Cordis internals exposed', () => {
    expect(exposedInternalsInvocation({
      execArgv: ['--enable-source-maps'],
      script: '/app/acryl.js',
      args: ['tui', '--profile', 'dev'],
    })).toEqual([
      '--expose-internals',
      '--enable-source-maps',
      '/app/acryl.js',
      'tui',
      '--profile',
      'dev',
    ])
  })

  it('does not restart an already exposed Node process', () => {
    expect(exposedInternalsInvocation({
      execArgv: ['--expose-internals'],
      script: '/app/acryl.js',
      args: [],
    })).toBeUndefined()
  })
})
