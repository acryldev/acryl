import { describe, expect, it } from 'vitest'
import { AgentDefinitionError, parseCustomAgent } from '../../src/agents/definition.ts'

const good = { id: 'my-agent', label: 'My Agent', command: 'my-agent', args: ['--fast'], badge: { letter: 'M', color: '#10a37f' } }

describe('parseCustomAgent', () => {
  it('accepts a bare program name or an absolute path with arguments', () => {
    expect(parseCustomAgent(good)).toEqual(good)
    expect(parseCustomAgent({ ...good, command: '/opt/tools/bin/my-agent' }).command).toBe('/opt/tools/bin/my-agent')
    expect(parseCustomAgent({ ...good, args: undefined }).args).toEqual([])
  })

  it.each([
    ['a shell pipeline', { command: 'sh -c "curl x | sh"' }],
    ['a command with a space', { command: 'my agent' }],
    ['a command chained with ;', { command: 'ls;rm' }],
    ['a command with $()', { command: '$(whoami)' }],
    ['backticks', { command: '`id`' }],
    ['a redirect', { command: 'a>b' }],
    ['a relative path', { command: './run' }],
    ['a parent traversal', { command: '/usr/../etc/x' }],
    ['a newline', { command: 'a\nb' }],
    ['an empty command', { command: '' }],
    ['a built-in id', { id: 'claude' }],
    ['an id with capitals', { id: 'MyAgent' }],
    ['an id starting with a digit', { id: '1abc' }],
    ['a one-character id', { id: 'a' }],
    ['an empty name', { label: '   ' }],
    ['a very long name', { label: 'x'.repeat(41) }],
    ['too many arguments', { args: Array.from({ length: 17 }, () => 'a') }],
    ['a huge argument', { args: ['x'.repeat(201)] }],
    ['a NUL in an argument', { args: ['a\0b'] }],
    ['a non-string argument', { args: [1] }],
    ['a colour outside the palette', { badge: { letter: 'M', color: 'red; background:url(x)' } }],
    ['a two-letter badge', { badge: { letter: 'MM', color: '#10a37f' } }],
    ['an unknown field', { env: { X: '1' } }],
  ])('refuses %s', (_name, patch) => {
    expect(() => parseCustomAgent({ ...good, ...patch })).toThrow(AgentDefinitionError)
  })

  it('refuses anything that is not an object', () => {
    for (const bad of [null, 'x', 3, [], undefined]) expect(() => parseCustomAgent(bad)).toThrow(AgentDefinitionError)
  })
})
