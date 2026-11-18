/**
 * Syntax colours for the file tab: a small tokenizer for the languages an app is written in (TypeScript and JavaScript, JSON, CSS, HTML, YAML,
 * shell, Markdown). It colours, it does not parse; a token it does not know stays plain text.
 */

export type TokenKind = 'kw' | 'fn' | 'st' | 'ty' | 'pu' | 'va' | 'cm' | 'nu' | 'plain'

export interface Token {
  readonly kind: TokenKind
  readonly text: string
}

const KEYWORDS = new Set([
  'import', 'export', 'from', 'as', 'default', 'function', 'return', 'const', 'let', 'var', 'if', 'else', 'for', 'while', 'do', 'switch', 'case',
  'break', 'continue', 'new', 'class', 'extends', 'implements', 'interface', 'type', 'enum', 'async', 'await', 'try', 'catch', 'finally', 'throw',
  'typeof', 'instanceof', 'in', 'of', 'void', 'yield', 'static', 'readonly', 'public', 'private', 'protected', 'declare', 'module', 'namespace',
  'true', 'false', 'null', 'undefined', 'this', 'super', 'satisfies', 'keyof',
])

type Language = 'code' | 'hash' | 'markup' | 'plain'

/** Which tokenizer a file gets, by its extension. */
export function languageOf(path: string): Language {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts', 'cts', 'json', 'jsonc', 'css', 'scss'].includes(extension)) return 'code'
  if (['yml', 'yaml', 'sh', 'bash', 'zsh', 'toml', 'py', 'rb'].includes(extension) || path.endsWith('.env')) return 'hash'
  if (['html', 'htm', 'xml', 'svg', 'vue'].includes(extension)) return 'markup'
  return 'plain'
}

const CODE = /(\/\/.*$|\/\*[\s\S]*?(?:\*\/|$))|('(?:\\.|[^'\\])*'?|"(?:\\.|[^"\\])*"?|`(?:\\.|[^`\\])*`?)|(\b\d[\d_]*(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|([{}()[\];:.,=<>+\-*/!?&|%^~@]+)/gm
const HASH = /(#.*$)|('(?:\\.|[^'\\])*'?|"(?:\\.|[^"\\])*"?)|(\b\d[\d_]*(?:\.\d+)?\b)|([A-Za-z_$][\w$-]*(?=\s*:))|([{}()[\];:,=|&-]+)/gm
const MARKUP = /(<!--[\s\S]*?(?:-->|$))|("(?:[^"])*"?|'(?:[^'])*'?)|(<\/?[A-Za-z][\w:-]*|\/?>)|([A-Za-z-]+(?==))/gm

/** One line's tokens. Lines are coloured one at a time, so a block comment over several lines is coloured only on its first. */
export function highlightLine(line: string, language: Language): Token[] {
  if (language === 'plain') return line === '' ? [] : [{ kind: 'plain', text: line }]
  const pattern = language === 'code' ? CODE : language === 'hash' ? HASH : MARKUP
  const tokens: Token[] = []
  let last = 0
  pattern.lastIndex = 0
  for (let match = pattern.exec(line); match !== null; match = pattern.exec(line)) {
    if (match[0] === '') { pattern.lastIndex += 1; continue }
    if (match.index > last) tokens.push({ kind: 'plain', text: line.slice(last, match.index) })
    tokens.push({ kind: kindOf(match, line, language), text: match[0] })
    last = match.index + match[0].length
  }
  if (last < line.length) tokens.push({ kind: 'plain', text: line.slice(last) })
  return tokens
}

function kindOf(match: RegExpExecArray, line: string, language: Language): TokenKind {
  if (match[1] !== undefined) return 'cm'
  if (match[2] !== undefined) return 'st'
  if (language === 'markup') return match[3] !== undefined ? 'kw' : 'ty'
  if (match[3] !== undefined) return 'nu'
  if (match[4] !== undefined) {
    if (language === 'hash') return 'va'
    const word = match[4]
    if (KEYWORDS.has(word)) return 'kw'
    if (/^\s*\(/.test(line.slice(match.index + word.length))) return 'fn'
    if (/^[A-Z]/.test(word)) return 'ty'
    // A property after a dot stays plain, as in the editor theme the mockup uses.
    return line[match.index - 1] === '.' ? 'plain' : 'va'
  }
  return 'pu'
}
