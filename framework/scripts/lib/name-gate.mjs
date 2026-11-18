// The release gate's rule about the upstream project's name (scripts/verify-tarball.mjs). The name is built from character codes so no file of this repository has to carry it.
export const NAME = String.fromCharCode(104, 111, 110, 111)

/** English words that contain the name as a substring. Only these whole words are allowed; every other word that contains it is a hit. */
export const ALLOWED_WORDS = new Set([
  'honor',
  'honors',
  'honored',
  'honour',
  'honours',
  'honoured',
  'honorific',
  'honorable',
  'honorary',
])

const word = new RegExp(`[A-Za-z]*${NAME}[A-Za-z]*`, 'gi')

/**
 * The words in `text` that contain the name, case-insensitively, except the allowed English words. A word is a run of letters, so snake_case, SCREAMING_CASE and kebab-case
 * names split at the separator and a camelCase name is one word (`Request` + name is a hit, `honored` is not).
 * @returns the offending words as written
 */
export function findName(text) {
  return [...text.matchAll(word)]
    .map((m) => m[0])
    .filter((w) => !ALLOWED_WORDS.has(w.toLowerCase()))
}
