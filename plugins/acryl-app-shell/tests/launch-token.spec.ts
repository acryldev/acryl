import { describe, expect, it } from 'vitest'
import { stripLaunchToken } from '../src/client/launch-token.ts'

describe('stripLaunchToken', () => {
  it('removes only the token, keeping the path, other query fields and the hash', () => {
    expect(stripLaunchToken('http://127.0.0.1:3081/?token=abc')).toBe('/')
    expect(stripLaunchToken('http://127.0.0.1:3081/?token=abc&workspace=w1#logs')).toBe('/?workspace=w1#logs')
    expect(stripLaunchToken('http://127.0.0.1:3081/app?token=abc&x=1')).toBe('/app?x=1')
  })

  it('leaves an address without a token alone', () => {
    expect(stripLaunchToken('http://127.0.0.1:3081/?workspace=w1#logs')).toBeUndefined()
    expect(stripLaunchToken('http://127.0.0.1:3081/')).toBeUndefined()
    expect(stripLaunchToken('not a url')).toBeUndefined()
  })

  it('removes an empty token value too', () => {
    expect(stripLaunchToken('http://127.0.0.1:3081/?token=&x=1')).toBe('/?x=1')
  })
})
