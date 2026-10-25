/**
 * The upstream project's name must not survive in ported code (the owner's rule: it appears only in LICENSE files). Any occurrence counts,
 * in any case and inside any longer name (`is<Name>App`, `__<name>_key`, `X_<NAME>_HEADER`, `<name>-x`), except an English word the name
 * only starts, from an explicit list. This module never spells the name: callers read it from a LICENSE.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** The English words that start with the name, as the endings after it ("…r", "…rs", "…rific", …). */
const WORD_ENDINGS = ['r', 'rs', 'red', 'ring', 'ur', 'urs', 'ured', 'uring', 'rific', 'rable', 'rably', 'rary']

/** The name from a package's LICENSE ("derived from <Name> vX (https://github.com/<name>js/...)"), or undefined. */
export function upstreamNameFromLicense(dir) {
  const license = join(dir, 'LICENSE')
  return existsSync(license) ? /are derived from .+? \(https:\/\/github\.com\/([a-z]+)js\//u.exec(readFileSync(license, 'utf8'))?.[1] : undefined
}

/** Every place `text` still carries `name`, as `{ line, found }`; the allowed English words are skipped. */
export function upstreamNameIn(text, name) {
  const words = new Set(WORD_ENDINGS.map(ending => `${name}${ending}`))
  const any = new RegExp(`${name}[a-z]*`, 'giu')
  const found = []
  text.split('\n').forEach((line, at) => {
    for (const match of line.matchAll(any)) {
      const word = match[0].toLowerCase()
      // An allowed word stands alone: a letter right before it makes it part of a longer name, which is not allowed.
      const before = match.index > 0 ? line[match.index - 1] : ''
      if (words.has(word) && !/[a-z]/iu.test(before)) continue
      found.push({ line: at + 1, found: match[0] })
    }
  })
  return found
}
