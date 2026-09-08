import { describe, expect, it } from 'vitest'
import { mentionQuery, matchFileCandidates } from '../../src/tui/fileMention.js'

describe('mentionQuery', () => {
  it('opens on a bare `@` at the start of the line', () => {
    expect(mentionQuery('@', 1)).toEqual({ isMentionMode: true, query: '', start: 0 })
  })

  it('opens mid-sentence after whitespace', () => {
    expect(mentionQuery('fix @src/index', 14)).toEqual({ isMentionMode: true, query: 'src/index', start: 4 })
  })

  it('tracks the query up to the cursor, not the end of the line', () => {
    expect(mentionQuery('@foo bar', 3)).toEqual({ isMentionMode: true, query: 'fo', start: 0 })
  })

  it('does not open when the `@` is preceded by a non-whitespace character', () => {
    expect(mentionQuery('user@host', 9).isMentionMode).toBe(false)
  })

  it('does not open once whitespace follows the `@`', () => {
    expect(mentionQuery('@ foo', 5).isMentionMode).toBe(false)
  })

  it('does not open without an `@` in the current token', () => {
    expect(mentionQuery('hello world', 11).isMentionMode).toBe(false)
  })

  it('does not open at the very start of an empty buffer', () => {
    expect(mentionQuery('', 0).isMentionMode).toBe(false)
  })
})

describe('matchFileCandidates', () => {
  const candidates = ['src/index.ts', 'src/tui/App.tsx', 'src/tui/PromptInput.tsx', 'test/tui/commands.test.ts', 'README.md']

  it('filters by case-insensitive substring', () => {
    expect(matchFileCandidates(candidates, 'PROMPT')).toEqual(['src/tui/PromptInput.tsx'])
  })

  it('ranks a full path-prefix match before a basename-prefix match, even when longer', () => {
    const result = matchFileCandidates(['readme/file.txt', 'src/readme.txt'], 'readme')
    expect(result[0]).toBe('readme/file.txt')
  })

  it('ranks a basename-prefix match before a plain substring match', () => {
    const result = matchFileCandidates(['a/README.md', 'b/x-README.md'], 'readme')
    expect(result[0]).toBe('a/README.md')
  })

  it('returns nothing for a non-matching query', () => {
    expect(matchFileCandidates(candidates, 'zzz')).toEqual([])
  })

  it('returns every candidate for an empty query, capped at the limit', () => {
    expect(matchFileCandidates(candidates, '', 3)).toHaveLength(3)
  })

  it('respects a custom limit', () => {
    expect(matchFileCandidates(candidates, '', 1)).toHaveLength(1)
  })
})
