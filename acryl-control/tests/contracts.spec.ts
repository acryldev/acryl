import { describe, expect, it } from 'vitest'
import { parseControlEnvelope } from '../src/contracts/control-protocol.ts'

describe('parseControlEnvelope', () => {
  it('accepts a canonical success envelope', () => {
    expect(parseControlEnvelope(JSON.stringify({
      schemaVersion: 1,
      ok: true,
      operation: 'host.status',
      result: { mode: 'direct' },
    }))).toEqual({
      schemaVersion: 1,
      ok: true,
      operation: 'host.status',
      result: { mode: 'direct' },
    })
  })

  it('accepts a canonical failure envelope', () => {
    expect(parseControlEnvelope(JSON.stringify({
      schemaVersion: 1,
      ok: false,
      operation: 'plugin.reload',
      error: {
        code: 'ACRYL_PROTECTED',
        message: 'entry is protected',
        retryable: false,
      },
    }))).toEqual({
      schemaVersion: 1,
      ok: false,
      operation: 'plugin.reload',
      error: {
        code: 'ACRYL_PROTECTED',
        message: 'entry is protected',
        retryable: false,
      },
    })
  })

  it('rejects unknown versions and malformed result shapes', () => {
    expect(() => parseControlEnvelope('{"schemaVersion":2,"ok":true,"operation":"host.status","result":{}}'))
      .toThrow('unsupported control envelope version')
    expect(() => parseControlEnvelope('{"schemaVersion":1,"ok":false,"operation":"host.status"}'))
      .toThrow('invalid control failure envelope')
    expect(() => parseControlEnvelope('not json')).toThrow('invalid control envelope JSON')
  })
})
