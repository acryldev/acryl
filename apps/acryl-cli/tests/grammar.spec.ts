import { describe, expect, it } from 'vitest'
import { parseAcrylArgs } from '../src/cli/grammar.ts'

const SURFACE_FLAGS = { kind: 'surface', json: false, version: false, help: false } as const

describe('parseAcrylArgs', () => {
  it('uses the TUI and current profile by default', () => {
    expect(parseAcrylArgs([])).toEqual({ ...SURFACE_FLAGS, command: 'tui' })
    expect(parseAcrylArgs(['--profile', 'desktop'])).toEqual({
      ...SURFACE_FLAGS,
      command: 'tui',
      profile: 'desktop',
    })
  })

  it('parses peer host commands without aliases', () => {
    expect(parseAcrylArgs(['tui'])).toEqual({ ...SURFACE_FLAGS, command: 'tui' })
    expect(parseAcrylArgs(['gui', '--profile', 'work'])).toEqual({
      ...SURFACE_FLAGS,
      command: 'gui',
      profile: 'work',
    })
    expect(parseAcrylArgs(['web'])).toEqual({ ...SURFACE_FLAGS, command: 'web' })
  })

  it('rejects missing values, duplicates, and unknown arguments', () => {
    expect(() => parseAcrylArgs(['--profile'])).toThrow('requires a value')
    expect(() => parseAcrylArgs(['--profile', 'desktop', '--profile', 'work'])).toThrow('only once')
    expect(() => parseAcrylArgs(['desktop'])).toThrow('unknown command')
    expect(() => parseAcrylArgs(['tui', '--wat'])).toThrow('unknown option')
    expect(() => parseAcrylArgs(['tui', 'extra'])).toThrow('unexpected argument for tui')
  })

  it('lists plugins when the plugin command has no action', () => {
    expect(parseAcrylArgs(['plugin'])).toEqual({ ...SURFACE_FLAGS, kind: 'plugin', action: 'list' })
  })

  it('parses the plugin action and the profile it applies to', () => {
    expect(parseAcrylArgs(['plugin', 'list', '--json'])).toEqual({
      kind: 'plugin',
      action: 'list',
      json: true,
      version: false,
      help: false,
    })
    expect(parseAcrylArgs(['plugin', 'disable', 'include:ui-acryl', '--profile', 'work'])).toEqual({
      kind: 'plugin',
      action: 'disable',
      entryId: 'include:ui-acryl',
      json: false,
      version: false,
      help: false,
      profile: 'work',
    })
    // `add`/`remove` are install actions (spec 034, T006): recognized here so
    // the command surface matches the plan, refused by the runner.
    expect(parseAcrylArgs(['plugin', 'add', 'acryl-dsh-editor-plugin'])).toEqual({
      kind: 'plugin',
      action: 'add',
      entryId: 'acryl-dsh-editor-plugin',
      json: false,
      version: false,
      help: false,
    })
    expect(parseAcrylArgs(['plugin', 'doctor'])).toEqual({
      kind: 'plugin',
      action: 'doctor',
      json: false,
      version: false,
      help: false,
    })
  })

  it('rejects plugin arguments that do not match the action', () => {
    expect(() => parseAcrylArgs(['plugin', 'enable'])).toThrow('requires a plugin id')
    expect(() => parseAcrylArgs(['plugin', 'add'])).toThrow('requires a package name')
    expect(() => parseAcrylArgs(['plugin', 'doctor', 'ui-acryl'])).toThrow('takes no argument')
    expect(() => parseAcrylArgs(['plugin', 'install'])).toThrow('unknown plugin action')
    expect(() => parseAcrylArgs(['plugin', 'enable', 'a', 'b'])).toThrow('unexpected argument for plugin enable')
    expect(() => parseAcrylArgs(['plugin', 'list', '--resume', 'abc'])).toThrow('--resume applies to the tui command')
  })
})
