import { describe, expect, it } from 'vitest'
import { parseUnifiedDiff } from '../src/client/workspace/unified-diff.ts'

const SAMPLE = [
  'diff --git a/a.txt b/a.txt',
  'index 111..222 100644',
  '--- a/a.txt',
  '+++ b/a.txt',
  '@@ -1,3 +1,4 @@',
  ' one',
  '-two',
  '+TWO',
  '+extra',
  ' three',
  '@@ -10,2 +11,2 @@ fn',
  ' ten',
  '-old',
  '+new',
  '\\ No newline at end of file',
  '',
].join('\n')

describe('parseUnifiedDiff', () => {
  it('returns no rows for empty input', () => {
    expect(parseUnifiedDiff('')).toEqual([])
  })

  it('classifies header, hunk, add, remove and context rows', () => {
    const rows = parseUnifiedDiff(SAMPLE)
    expect(rows.slice(0, 4).every(row => row.kind === 'meta')).toBe(true)
    expect(rows[4]).toMatchObject({ kind: 'hunk' })
    expect(rows[5]).toMatchObject({ kind: 'context', text: 'one' })
    expect(rows[6]).toMatchObject({ kind: 'remove', text: 'two' })
    expect(rows[7]).toMatchObject({ kind: 'add', text: 'TWO' })
    expect(rows.at(-1)).toMatchObject({ kind: 'meta' })
  })

  it('tracks old and new line numbers across hunks', () => {
    const rows = parseUnifiedDiff(SAMPLE)
    expect(rows[5]).toMatchObject({ oldNo: 1, newNo: 1 })
    expect(rows[6]).toMatchObject({ oldNo: 2 })
    expect(rows[6]?.newNo).toBeUndefined()
    expect(rows[7]).toMatchObject({ newNo: 2 })
    expect(rows[8]).toMatchObject({ newNo: 3 })
    expect(rows[9]).toMatchObject({ oldNo: 3, newNo: 4 })
    expect(rows[11]).toMatchObject({ kind: 'context', oldNo: 10, newNo: 11 })
    expect(rows[12]).toMatchObject({ kind: 'remove', oldNo: 11 })
    expect(rows[13]).toMatchObject({ kind: 'add', newNo: 12 })
  })

  it('keeps a "-- " content line as a removal once inside a hunk', () => {
    const rows = parseUnifiedDiff('@@ -1 +1 @@\n--- comment\n+++ comment2\n')
    expect(rows[1]).toMatchObject({ kind: 'remove', text: '-- comment' })
    expect(rows[2]).toMatchObject({ kind: 'add', text: '++ comment2' })
  })
})
