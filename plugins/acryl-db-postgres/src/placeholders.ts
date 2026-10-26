/**
 * The port's `?` bindings in Postgres's spelling, `$1`, `$2`, ... A scanner, not a pattern: a `?` inside a quoted string (`'...'`, `E'...'`,
 * `$$...$$`, `$tag$...$tag$`), a quoted identifier (`"..."`) or a comment (`-- ...`, `/* ... *\/`, which nest in Postgres) is text and stays.
 * Every other `?` is a binding, so the jsonb operators `?`, `?|` and `?&` cannot be written through the port: their functions
 * (`jsonb_exists`, `jsonb_exists_any`, `jsonb_exists_all`) can.
 */

export interface TranslatedSql {
  readonly text: string
  /** How many bindings the statement takes. */
  readonly count: number
}

/** The tag of a dollar quote starting at `at` (`$$` or `$name$`), or undefined when `$` starts something else (`$1`, an identifier's `$`). */
function dollarTag(sql: string, at: number): string | undefined {
  const match = /^\$(?:[A-Za-z_\u0080-￿][A-Za-z0-9_\u0080-￿]*)?\$/u.exec(sql.slice(at))
  return match?.[0]
}

/** Where a quoted run that starts at `at` with `quote` ends (the index after its closing quote); a doubled quote is part of the run. */
function endOfQuoted(sql: string, at: number, quote: string, backslashEscapes: boolean): number {
  let i = at + 1
  while (i < sql.length) {
    const char = sql[i]
    if (backslashEscapes && char === '\\') i += 2
    else if (char === quote) {
      if (sql[i + 1] === quote) i += 2
      else return i + 1
    } else i += 1
  }
  return sql.length
}

/** Where a block comment that starts at `at` ends, counting nested `/* *\/` pairs as Postgres does. */
function endOfBlockComment(sql: string, at: number): number {
  let depth = 1
  let i = at + 2
  while (i < sql.length && depth > 0) {
    if (sql.startsWith('/*', i)) { depth += 1; i += 2 } else if (sql.startsWith('*/', i)) { depth -= 1; i += 2 } else i += 1
  }
  return i
}

export function translatePlaceholders(sql: string): TranslatedSql {
  let out = ''
  let count = 0
  let i = 0
  while (i < sql.length) {
    const char = sql[i]
    let end = i + 1
    if (char === '?') {
      count += 1
      out += `$${String(count)}`
      i += 1
      continue
    }
    if (char === "'") {
      // E'...' (and e'...') takes backslash escapes; the E was copied already.
      const escaped = i > 0 && /[Ee]/u.test(sql[i - 1] ?? '') && !/[A-Za-z0-9_$]/u.test(sql[i - 2] ?? '')
      end = endOfQuoted(sql, i, "'", escaped)
    } else if (char === '"') end = endOfQuoted(sql, i, '"', false)
    else if (char === '-' && sql[i + 1] === '-') {
      const newline = sql.indexOf('\n', i)
      end = newline === -1 ? sql.length : newline
    } else if (char === '/' && sql[i + 1] === '*') end = endOfBlockComment(sql, i)
    else if (char === '$' && !/[A-Za-z0-9_]/u.test(sql[i - 1] ?? '')) {
      const tag = dollarTag(sql, i)
      if (tag !== undefined) {
        const close = sql.indexOf(tag, i + tag.length)
        end = close === -1 ? sql.length : close + tag.length
      }
    }
    out += sql.slice(i, end)
    i = end
  }
  return { text: out, count }
}
