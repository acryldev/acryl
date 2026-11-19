import { describe, expect, it } from 'vitest'
import { translatePlaceholders } from '../src/placeholders.ts'

const translate = (sql: string) => translatePlaceholders(sql)

describe('translatePlaceholders', () => {
  it('numbers each ? binding in order', () => {
    expect(translate('SELECT * FROM t WHERE a = ? AND b IN (?, ?)')).toEqual({ text: 'SELECT * FROM t WHERE a = $1 AND b IN ($2, $3)', count: 3 })
    expect(translate('SELECT 1')).toEqual({ text: 'SELECT 1', count: 0 })
  })

  it('leaves ? inside single-quoted strings, doubled quotes included', () => {
    expect(translate("SELECT 'a?b', 'it''s ?', ?")).toEqual({ text: "SELECT 'a?b', 'it''s ?', $1", count: 1 })
  })

  it('leaves ? inside E strings, whose backslash escapes a quote', () => {
    expect(translate("SELECT E'a\\'?', ?")).toEqual({ text: "SELECT E'a\\'?', $1", count: 1 })
    expect(translate("SELECT e'?\\\\', ?")).toEqual({ text: "SELECT e'?\\\\', $1", count: 1 })
    // A plain string ending in a backslash is not an E string: the quote closes it.
    expect(translate("SELECT 'a\\', ?")).toEqual({ text: "SELECT 'a\\', $1", count: 1 })
    // An identifier ending in e is not an E prefix.
    expect(translate("SELECT name'x?'")).toEqual({ text: "SELECT name'x?'", count: 0 })
  })

  it('leaves ? inside quoted identifiers', () => {
    expect(translate('SELECT "col?", "a""?" FROM "t?" WHERE x = ?')).toEqual({ text: 'SELECT "col?", "a""?" FROM "t?" WHERE x = $1', count: 1 })
  })

  it('leaves ? inside dollar-quoted strings, tagged or not, and keeps $n and identifiers with $', () => {
    expect(translate('SELECT $$a ? b$$, $fn$ ? $$ ? $fn$, ?')).toEqual({ text: 'SELECT $$a ? b$$, $fn$ ? $$ ? $fn$, $1', count: 1 })
    expect(translate('SELECT x$y, ? FROM t')).toEqual({ text: 'SELECT x$y, $1 FROM t', count: 1 })
  })

  it('leaves ? inside line comments and nested block comments', () => {
    expect(translate('SELECT ? -- why?\n, ?')).toEqual({ text: 'SELECT $1 -- why?\n, $2', count: 2 })
    expect(translate('SELECT /* a /* nested ? */ still ? */ ?')).toEqual({ text: 'SELECT /* a /* nested ? */ still ? */ $1', count: 1 })
    expect(translate('SELECT ? -- trailing ?')).toEqual({ text: 'SELECT $1 -- trailing ?', count: 1 })
  })

  it('copies an unterminated string or comment to the end, binding nothing inside it', () => {
    expect(translate("SELECT ?, 'open ?")).toEqual({ text: "SELECT $1, 'open ?", count: 1 })
    expect(translate('SELECT ? /* open ?')).toEqual({ text: 'SELECT $1 /* open ?', count: 1 })
  })

  it('treats a jsonb ? operator as a binding, as the port documents', () => {
    expect(translate("SELECT data ? 'key' FROM t")).toEqual({ text: "SELECT data $1 'key' FROM t", count: 1 })
  })
})
