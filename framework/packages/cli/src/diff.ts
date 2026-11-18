/** A unified diff of two texts (3 lines of context), for showing what an upgrade changes. Very large pairs are summarized instead. */

export interface DiffStat {
  readonly added: number
  readonly removed: number
}

type Op = { kind: ' ' | '+' | '-'; line: string }

function ops(a: string[], b: string[]): Op[] | undefined {
  if (a.length * b.length > 6_000_000) return undefined
  // Longest common subsequence by dynamic programming over the suffixes.
  const width = b.length + 1
  const table = new Uint32Array((a.length + 1) * width)
  for (let i = a.length - 1; i >= 0; i -= 1)
    for (let j = b.length - 1; j >= 0; j -= 1)
      table[i * width + j] =
        a[i] === b[j]
          ? (table[(i + 1) * width + j + 1] as number) + 1
          : Math.max(table[(i + 1) * width + j] as number, table[i * width + j + 1] as number)
  const out: Op[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: ' ', line: a[i] as string })
      i += 1
      j += 1
    } else if ((table[(i + 1) * width + j] as number) >= (table[i * width + j + 1] as number)) {
      out.push({ kind: '-', line: a[i] as string })
      i += 1
    } else {
      out.push({ kind: '+', line: b[j] as string })
      j += 1
    }
  }
  for (; i < a.length; i += 1) out.push({ kind: '-', line: a[i] as string })
  for (; j < b.length; j += 1) out.push({ kind: '+', line: b[j] as string })
  return out
}

const lines = (text: string): string[] =>
  text === '' ? [] : text.replace(/\r\n/gu, '\n').replace(/\n$/u, '').split('\n')

/** How many lines a change adds and removes; undefined counts when the pair is too large to compare. */
export function diffStat(from: string, to: string): DiffStat {
  const all = ops(lines(from), lines(to))
  if (all === undefined) return { added: lines(to).length, removed: lines(from).length }
  return {
    added: all.filter((op) => op.kind === '+').length,
    removed: all.filter((op) => op.kind === '-').length,
  }
}

/** `--- a/<name>`, `+++ b/<name>` and the hunks; empty when the texts are equal. */
export function unifiedDiff(name: string, from: string, to: string, context = 3): string {
  const a = lines(from)
  const b = lines(to)
  const all = ops(a, b)
  if (all === undefined)
    return `--- a/${name}\n+++ b/${name}\n(too large to compare line by line: ${a.length} lines became ${b.length})\n`
  if (!all.some((op) => op.kind !== ' ')) return ''
  const out = [`--- a/${name}`, `+++ b/${name}`]
  let at = 0
  let aLine = 1
  let bLine = 1
  const positions = all.map((op) => {
    const here = { a: aLine, b: bLine }
    if (op.kind !== '+') aLine += 1
    if (op.kind !== '-') bLine += 1
    return here
  })
  while (at < all.length) {
    while (at < all.length && all[at]?.kind === ' ') at += 1
    if (at >= all.length) break
    const start = Math.max(0, at - context)
    let end = at
    for (let k = at; k < all.length; k += 1) {
      if (all[k]?.kind !== ' ') end = k
      else if (k - end > context * 2) break
    }
    const stop = Math.min(all.length, end + context + 1)
    const slice = all.slice(start, stop)
    const first = positions[start] as { a: number; b: number }
    out.push(
      `@@ -${first.a},${slice.filter((op) => op.kind !== '+').length} +${first.b},${slice.filter((op) => op.kind !== '-').length} @@`,
    )
    for (const op of slice) out.push(`${op.kind}${op.line}`)
    at = stop
  }
  return `${out.join('\n')}\n`
}
