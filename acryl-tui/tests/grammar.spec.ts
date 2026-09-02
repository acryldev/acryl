import { describe, expect, it } from 'vitest'
import { parseAcrylArgs } from '../src/cli/grammar.ts'

describe('parseAcrylArgs', () => {
  it('uses the TUI and current profile by default', () => {
    expect(parseAcrylArgs([])).toEqual({
      command: 'tui',
      json: false,
      version: false,
      help: false,
    })
    expect(parseAcrylArgs(['--profile', 'desktop'])).toEqual({
      command: 'tui',
      json: false,
      version: false,
      help: false,
      profile: 'desktop',
    })
  })

  it('parses peer host commands without aliases', () => {
    expect(parseAcrylArgs(['tui'])).toEqual({ command: 'tui', json: false, version: false, help: false })
    expect(parseAcrylArgs(['gui', '--profile', 'work'])).toEqual({
      command: 'gui',
      json: false,
      version: false,
      help: false,
      profile: 'work',
    })
    expect(parseAcrylArgs(['web'])).toEqual({ command: 'web', json: false, version: false, help: false })
    expect(parseAcrylArgs(['acp'])).toEqual({ command: 'acp', json: false, version: false, help: false })
  })

  it('rejects missing values, duplicates, and unknown arguments', () => {
    expect(() => parseAcrylArgs(['--profile'])).toThrow('requires a value')
    expect(() => parseAcrylArgs(['--profile', 'desktop', '--profile', 'work'])).toThrow('only once')
    expect(() => parseAcrylArgs(['desktop'])).toThrow('unknown command')
    expect(() => parseAcrylArgs(['tui', '--wat'])).toThrow('unknown option')
  })
})
