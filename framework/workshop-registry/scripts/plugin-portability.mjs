// What makes an entry usable on every OS: a plain-Node copy of `portabilityIssues` from @webboxes/blends-core (src/plugin-identity/plugin-portability.ts),
// because make-entry runs in a fork with no install. test/rules.test.mjs holds this copy to the original. Change the rules there first.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const MAX_PATH_LENGTH = 200
/** Git's own test for a binary file: a NUL byte within the first 8000 bytes. */
const BINARY_SNIFF_LENGTH = 8000
const NUL = 0
const CR = 13
const SKIPPED = new Set(['node_modules', '.git', 'acryl-source.json'])
const SKIPPED_PREFIX = 'acryl-v-'
const RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are exactly what Windows refuses in a name.
const FORBIDDEN_CHARACTER = /[<>:"|?*\\\u0000-\u001f]/

const isSkippedName = (name) => SKIPPED.has(name) || name.startsWith(SKIPPED_PREFIX)
const lastSegment = (path) => path.slice(path.lastIndexOf('/') + 1)

/** The files of a folder as the rules take them; a link is named, not followed, so one pointing at a folder is still only a link. */
export function folderFiles(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => !isSkippedName(entry.name))
    .flatMap((entry) => {
      const path = join(dir, entry.name)
      const relative = `${prefix}${entry.name}`
      if (entry.isDirectory()) return folderFiles(path, `${relative}/`)
      if (entry.isSymbolicLink())
        return [{ path: relative, bytes: Buffer.alloc(0), kind: 'symlink' }]
      return [{ path: relative, bytes: readFileSync(path), kind: 'file' }]
    })
}

function ownFiles(files) {
  return files
    .filter((file) => !file.path.split('/').some(isSkippedName))
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
}

function allPaths(files) {
  const paths = new Set()
  for (const { path } of files) {
    const segments = path.split('/')
    for (let end = 1; end <= segments.length; end += 1) paths.add(segments.slice(0, end).join('/'))
  }
  return [...paths].sort()
}

const namesMatching = (paths, test, rule, reason) =>
  paths
    .filter((path) => test(lastSegment(path)))
    .map((path) => ({ rule, path, reason: reason(lastSegment(path)) }))

function reservedNames(paths) {
  return namesMatching(
    paths,
    (name) => RESERVED_NAME.test(name.split('.')[0] ?? ''),
    'reserved-name',
    (name) => `"${name}" is a device name reserved by Windows; rename it`,
  )
}

function trailingDotsOrSpaces(paths) {
  return namesMatching(
    paths,
    (name) => /[. ]$/.test(name),
    'trailing-dot-or-space',
    (name) => `"${name}" ends in a dot or a space, which Windows removes; rename it`,
  )
}

function forbiddenCharacters(paths) {
  return namesMatching(
    paths,
    (name) => FORBIDDEN_CHARACTER.test(name),
    'forbidden-character',
    (name) =>
      `"${name}" has a character Windows refuses in a name (< > : " | ? * \\ or a control character); rename it`,
  )
}

function caseCollisions(paths) {
  const firstSpelling = new Map()
  const issues = []
  for (const path of paths) {
    const key = path.normalize('NFC').toLowerCase()
    const other = firstSpelling.get(key)
    if (other === undefined) firstSpelling.set(key, path)
    else
      issues.push({
        rule: 'case-collision',
        path,
        reason: `"${path}" and "${other}" are one name on macOS and Windows; rename one`,
      })
  }
  return issues
}

function longPaths(files) {
  return files
    .filter(({ path }) => path.length > MAX_PATH_LENGTH)
    .map(({ path }) => ({
      rule: 'path-too-long',
      path,
      reason: `the path has ${path.length} characters, over the limit of ${MAX_PATH_LENGTH} that leaves room for the app's own folder on Windows; shorten it`,
    }))
}

function symlinks(files) {
  return files
    .filter(({ kind }) => kind === 'symlink')
    .map(({ path }) => ({
      rule: 'symlink',
      path,
      reason:
        'it is a symbolic link, which Windows only creates with extra privilege; replace it with a real file',
    }))
}

function carriageReturns(files) {
  return files
    .filter(
      ({ bytes }) => !bytes.subarray(0, BINARY_SNIFF_LENGTH).includes(NUL) && bytes.includes(CR),
    )
    .map(({ path }) => ({
      rule: 'carriage-return',
      path,
      reason:
        'it has a carriage return, so its digest differs from the same text with LF line endings; save it with LF',
    }))
}

/** Every reason these files would not work the same on every OS, in a stable order; empty means portable. */
export function portabilityIssues(files) {
  const own = ownFiles(files)
  const paths = allPaths(own)
  return [
    ...reservedNames(paths),
    ...trailingDotsOrSpaces(paths),
    ...forbiddenCharacters(paths),
    ...caseCollisions(paths),
    ...longPaths(own),
    ...symlinks(own),
    ...carriageReturns(own),
  ]
}
