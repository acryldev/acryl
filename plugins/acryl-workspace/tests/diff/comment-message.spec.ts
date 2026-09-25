import { describe, expect, it } from 'vitest'
import { buildReviewComment } from '../../src/client/diff/comment-message.ts'

describe('buildReviewComment', () => {
  it('names the file, version, line and branch, quotes the line, then the comment', () => {
    const text = buildReviewComment({
      file: 'src/a.ts',
      branch: 'feature/x',
      side: 'new',
      line: 42,
      kind: 'add',
      lineText: 'const x = 1',
      comment: '  rename this to count  ',
    })
    expect(text).toBe([
      'Review comment on `src/a.ts` (new line 42, branch feature/x):',
      '',
      '```diff',
      '+const x = 1',
      '```',
      '',
      'rename this to count',
    ].join('\n'))
  })

  it('marks removed and context lines and omits an unknown branch', () => {
    const removed = buildReviewComment({ file: 'a', branch: null, side: 'old', line: 3, kind: 'remove', lineText: 'gone', comment: 'why?' })
    expect(removed).toContain('(old line 3):')
    expect(removed).toContain('\n-gone\n')
    const context = buildReviewComment({ file: 'a', branch: undefined, side: 'new', line: 1, kind: 'context', lineText: 'same', comment: 'ok' })
    expect(context).toContain('\n same\n')
    expect(context).not.toContain('branch')
  })
})
