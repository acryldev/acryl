import type { TrailingSlash } from './types.ts'

/** One piece of a route path. */
export type Segment =
  | { readonly kind: 'static', readonly value: string }
  | { readonly kind: 'param', readonly name: string }
  | { readonly kind: 'wildcard' }

export interface Pattern {
  /** The path as written (normalized for the trailing-slash rule). */
  readonly source: string
  readonly segments: readonly Segment[]
}

/** Split a pathname into segments. `/` is the empty list; under `strict` a trailing slash leaves a final empty segment. */
export function splitPath(path: string, trailingSlash: TrailingSlash): string[] {
  let value = path
  if (trailingSlash === 'ignore' && value.length > 1 && value.endsWith('/')) value = value.slice(0, -1)
  if (value === '/' || value === '') return []
  return value.slice(1).split('/')
}

/** Compile `/a/:id/*`. A `*` is allowed only as the last segment; param names must be non-empty and unique. */
export function compilePattern(path: string, trailingSlash: TrailingSlash): Pattern {
  if (!path.startsWith('/')) throw new TypeError(`router: path "${path}" must start with "/"`)
  const parts = splitPath(path, trailingSlash)
  const names = new Set<string>()
  const segments: Segment[] = parts.map((part, index) => {
    if (part === '*') {
      if (index !== parts.length - 1) throw new TypeError(`router: "*" must be the last segment in "${path}"`)
      return { kind: 'wildcard' }
    }
    if (part.startsWith(':')) {
      const name = part.slice(1)
      if (name === '') throw new TypeError(`router: empty parameter name in "${path}"`)
      if (names.has(name)) throw new TypeError(`router: duplicate parameter ":${name}" in "${path}"`)
      names.add(name)
      return { kind: 'param', name }
    }
    return { kind: 'static', value: part }
  })
  return { source: path, segments }
}

/** The same path with every parameter name erased, so `/a/:id` and `/a/:name` collide as duplicates. */
export function shapeOf(pattern: Pattern): string {
  return '/' + pattern.segments.map(s => s.kind === 'static' ? s.value : s.kind === 'param' ? ':' : '*').join('/')
}

function decode(value: string): string {
  try { return decodeURIComponent(value) } catch { return value }
}

/** Match concrete path segments against a pattern; returns the parameters, or `undefined` when it does not match. */
export function matchPattern(pattern: Pattern, parts: readonly string[]): Record<string, string> | undefined {
  const params: Record<string, string> = {}
  const { segments } = pattern
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    if (segment === undefined) return undefined
    if (segment.kind === 'wildcard') {
      params['*'] = parts.slice(i).map(decode).join('/')
      return params
    }
    const part = parts[i]
    if (part === undefined) return undefined
    if (segment.kind === 'static') {
      if (segment.value !== part) return undefined
    } else {
      params[segment.name] = decode(part)
    }
  }
  return parts.length === segments.length ? params : undefined
}

const SCORE = { static: 3, param: 2, wildcard: 1 } as const

/** Compare two matching patterns: the more specific one (static before param before wildcard, left to right) wins. */
export function compareSpecificity(a: Pattern, b: Pattern): number {
  const length = Math.max(a.segments.length, b.segments.length)
  for (let i = 0; i < length; i++) {
    const left = a.segments[i]
    const right = b.segments[i]
    const l = left === undefined ? 0 : SCORE[left.kind]
    const r = right === undefined ? 0 : SCORE[right.kind]
    if (l !== r) return l - r
  }
  return 0
}
