/**
 * Arguments as a person types them on one line, and back. `--model "big one" -v` is three arguments.
 * Pure text handling shared by the page (the field) and its tests; nothing here runs a shell, and the
 * Host still receives an argument array.
 */

/** @throws Error when a quote is left open. */
export function splitArguments(text: string): string[] {
  const args: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let started = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? ''
    if (quote !== null) {
      if (char === quote) quote = null
      else if (char === '\\' && quote === '"' && (text[index + 1] === '"' || text[index + 1] === '\\')) { current += text[index + 1] ?? ''; index += 1 }
      else current += char
    } else if (char === '"' || char === "'") {
      quote = char
      started = true
    } else if (/\s/.test(char)) {
      if (started) { args.push(current); current = ''; started = false }
    } else {
      current += char
      started = true
    }
  }
  if (quote !== null) throw new Error('a quote was opened and never closed')
  if (started) args.push(current)
  return args
}

/** The inverse of {@link splitArguments}: quotes only the arguments that need it. */
export function joinArguments(args: readonly string[]): string {
  return args.map(arg => (arg !== '' && /^[A-Za-z0-9._@+:%~/=,*-]+$/.test(arg) ? arg : `"${arg.replace(/(["\\])/g, '\\$1')}"`)).join(' ')
}
