// What makes a plugin usable on every OS. A plugin written on one machine must install on macOS, Windows and Linux, and each rule below is
// a way it would not. Separate from identity on purpose (Pragmatic Programmer: orthogonality): a plugin with an issue still has a digest.
// Pure, so all rules run on one machine: a Mac can tell that a file name would fail on Windows without a Windows machine.
import { ownFiles, type PluginFile } from './plugin-digest.js'

export type PortabilityRule = 'reserved-name' | 'trailing-dot-or-space' | 'forbidden-character' | 'case-collision' | 'path-too-long' | 'symlink' | 'carriage-return'

/** One reason a plugin would not work the same on every OS: which rule, where, and a sentence a person can act on. */
export type PortabilityIssue = {
  readonly rule: PortabilityRule
  readonly path: string
  readonly reason: string
}

const MAX_PATH_LENGTH = 200
/** Git's own test for a binary file: a NUL byte within the first 8000 bytes. */
const BINARY_SNIFF_LENGTH = 8000
const NUL = 0
const CR = 13

const RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
const FORBIDDEN_CHARACTER = /[<>:"|?*\\\u0000-\u001f]/

const lastSegment = (path: string): string => path.slice(path.lastIndexOf('/') + 1)

/** Every file and folder the files imply, each once: `src/a.js` is both `src` and `src/a.js`. */
function allPaths(files: readonly PluginFile[]): string[] {
  const paths = new Set<string>()
  for (const { path } of files) {
    const segments = path.split('/')
    for (let end = 1; end <= segments.length; end += 1) paths.add(segments.slice(0, end).join('/'))
  }
  return [...paths].sort()
}

function reservedNames(paths: readonly string[]): PortabilityIssue[] {
  // Windows reserves the part before the first dot: `con.txt` and `con.tar.gz` are the device too.
  return paths
    .filter((path) => RESERVED_NAME.test(lastSegment(path).split('.')[0] ?? ''))
    .map((path) => ({ rule: 'reserved-name', path, reason: `"${lastSegment(path)}" is a device name reserved by Windows; rename it` }))
}

function trailingDotsOrSpaces(paths: readonly string[]): PortabilityIssue[] {
  return paths
    .filter((path) => /[. ]$/.test(lastSegment(path)))
    .map((path) => ({ rule: 'trailing-dot-or-space', path, reason: `"${lastSegment(path)}" ends in a dot or a space, which Windows removes; rename it` }))
}

function forbiddenCharacters(paths: readonly string[]): PortabilityIssue[] {
  return paths
    .filter((path) => FORBIDDEN_CHARACTER.test(lastSegment(path)))
    .map((path) => ({ rule: 'forbidden-character', path, reason: `"${lastSegment(path)}" has a character Windows refuses in a name (< > : " | ? * \\ or a control character); rename it` }))
}

function caseCollisions(paths: readonly string[]): PortabilityIssue[] {
  // Unicode form too: macOS treats the composed and decomposed spellings of a name as one file, as it does two cases.
  const firstSpelling = new Map<string, string>()
  const issues: PortabilityIssue[] = []
  for (const path of paths) {
    const key = path.normalize('NFC').toLowerCase()
    const other = firstSpelling.get(key)
    if (other === undefined) firstSpelling.set(key, path)
    else issues.push({ rule: 'case-collision', path, reason: `"${path}" and "${other}" are one name on macOS and Windows; rename one` })
  }
  return issues
}

function longPaths(files: readonly PluginFile[]): PortabilityIssue[] {
  return files
    .filter(({ path }) => path.length > MAX_PATH_LENGTH)
    .map(({ path }) => ({ rule: 'path-too-long', path, reason: `the path has ${path.length} characters, over the limit of ${MAX_PATH_LENGTH} that leaves room for the app's own folder on Windows; shorten it` }))
}

function symlinks(files: readonly PluginFile[]): PortabilityIssue[] {
  return files
    .filter(({ kind }) => kind === 'symlink')
    .map(({ path }) => ({ rule: 'symlink', path, reason: 'it is a symbolic link, which Windows only creates with extra privilege; replace it with a real file' }))
}

function isText(bytes: Uint8Array): boolean {
  return !bytes.subarray(0, BINARY_SNIFF_LENGTH).includes(NUL)
}

function carriageReturns(files: readonly PluginFile[]): PortabilityIssue[] {
  return files
    .filter(({ bytes }) => isText(bytes) && bytes.includes(CR))
    .map(({ path }) => ({ rule: 'carriage-return', path, reason: 'it has a carriage return, so its digest differs from the same text with LF line endings; save it with LF' }))
}

/** Every reason these files would not work the same on every OS, in a stable order; empty means portable. */
export function portabilityIssues(files: readonly PluginFile[]): PortabilityIssue[] {
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
