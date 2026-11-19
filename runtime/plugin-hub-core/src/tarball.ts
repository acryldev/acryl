// The tarball every plugin travels as (spec 044 lifecycle.md, "One unit: the tarball"): a gzipped ustar archive whose files sit under
// `package/`, the layout `npm pack` writes and pnpm, npm and DSH's installer read. Written here rather than by `npm pack`, because the shipped
// app has no npm; and written deterministically (sorted entries, fixed times and owners, a fixed gzip header), so the same files always give
// the same sha512 on every system and a re-pack of unchanged source is recognised as the same version.
import { createHash } from 'node:crypto'
import { gunzipSync, gzipSync } from 'node:zlib'

export interface TarballFile {
  /** Path inside the package, with `/` separators and no `package/` prefix. */
  readonly path: string
  readonly content: Uint8Array
  readonly executable?: boolean
}

/** npm's fixed time for every packed file (1985-10-26T08:15:00Z), so packs do not differ by when they were made. */
const FIXED_MTIME = 499_162_500
const BLOCK = 512
/** Byte 9 of a gzip header names the operating system; zlib writes a different one per platform, which would change the checksum. */
const GZIP_OS_BYTE = 9
const GZIP_OS_UNIX = 3

function writeString(header: Uint8Array, offset: number, length: number, value: string): void {
  const bytes = Buffer.from(value, 'utf8')
  if (bytes.length > length) throw new Error(`tar header field too long: ${value}`)
  header.set(bytes, offset)
}

function writeOctal(header: Uint8Array, offset: number, length: number, value: number): void {
  writeString(header, offset, length, `${value.toString(8).padStart(length - 1, '0')}\0`)
}

/** Split a long path into ustar's 155-byte prefix and 100-byte name at a `/`. */
function splitPath(path: string): { readonly prefix: string; readonly name: string } {
  if (Buffer.byteLength(path) <= 100) return { prefix: '', name: path }
  for (let index = path.indexOf('/'); index !== -1; index = path.indexOf('/', index + 1)) {
    const prefix = path.slice(0, index)
    const name = path.slice(index + 1)
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100) return { prefix, name }
  }
  throw new Error(`path too long to pack: ${path}`)
}

function header(path: string, size: number, mode: number): Uint8Array {
  const block = new Uint8Array(BLOCK)
  const { prefix, name } = splitPath(path)
  writeString(block, 0, 100, name)
  writeOctal(block, 100, 8, mode)
  writeOctal(block, 108, 8, 0)
  writeOctal(block, 116, 8, 0)
  writeOctal(block, 124, 12, size)
  writeOctal(block, 136, 12, FIXED_MTIME)
  block.fill(0x20, 148, 156)
  block[156] = 0x30
  writeString(block, 257, 6, 'ustar\0')
  writeString(block, 263, 2, '00')
  writeString(block, 345, 155, prefix)
  let sum = 0
  for (const byte of block) sum += byte
  writeString(block, 148, 8, `${sum.toString(8).padStart(6, '0')}\0 `)
  return block
}

/** Pack files into a gzipped tarball, `package/` prefixed and sorted by path. */
export function writeTarball(files: readonly TarballFile[]): Buffer {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  const chunks: Uint8Array[] = []
  const seen = new Set<string>()
  for (const file of sorted) {
    if (seen.has(file.path)) throw new Error(`duplicate path in package: ${file.path}`)
    seen.add(file.path)
    chunks.push(header(`package/${file.path}`, file.content.length, file.executable === true ? 0o755 : 0o644))
    chunks.push(file.content)
    const pad = (BLOCK - (file.content.length % BLOCK)) % BLOCK
    if (pad > 0) chunks.push(new Uint8Array(pad))
  }
  chunks.push(new Uint8Array(BLOCK * 2))
  const gzipped = gzipSync(Buffer.concat(chunks), { level: 9 })
  gzipped[GZIP_OS_BYTE] = GZIP_OS_UNIX
  return gzipped
}

function readString(block: Uint8Array, offset: number, length: number): string {
  const slice = block.subarray(offset, offset + length)
  const end = slice.indexOf(0)
  return Buffer.from(end === -1 ? slice : slice.subarray(0, end)).toString('utf8')
}

function readOctal(block: Uint8Array, offset: number, length: number): number {
  const text = readString(block, offset, length).trim()
  return text === '' ? 0 : Number.parseInt(text, 8)
}

/** Paths a pax extended header sets (`path=...`), the form `npm pack` uses for long names. */
function paxPath(content: Uint8Array): string | undefined {
  const text = Buffer.from(content).toString('utf8')
  for (const record of text.split('\n')) {
    const match = /^\d+ path=(.*)$/u.exec(record)
    if (match?.[1] !== undefined) return match[1]
  }
  return undefined
}

/**
 * Read a gzipped tarball's regular files, with the first path level (`package/` in an npm tarball) removed. Directory, link and global entries
 * are skipped; a path that would leave the package (`..`, absolute) is refused, so a crafted tarball cannot point outside it.
 */
export function readTarball(gzipped: Uint8Array, maxBytes = 64 * 1024 * 1024): TarballFile[] {
  const archive = gunzipSync(gzipped, { maxOutputLength: maxBytes })
  const files: TarballFile[] = []
  let offset = 0
  let nextPath: string | undefined
  while (offset + BLOCK <= archive.length) {
    const block = archive.subarray(offset, offset + BLOCK)
    if (block.every(byte => byte === 0)) break
    const size = readOctal(block, 124, 12)
    const type = String.fromCharCode(block[156] ?? 0)
    const prefix = readString(block, 345, 155)
    const name = readString(block, 0, 100)
    const content = archive.subarray(offset + BLOCK, offset + BLOCK + size)
    offset += BLOCK + Math.ceil(size / BLOCK) * BLOCK
    if (type === 'x') { nextPath = paxPath(content); continue }
    if (type === 'L') { nextPath = Buffer.from(content).toString('utf8').replace(/\0+$/u, ''); continue }
    const fullPath = nextPath ?? (prefix === '' ? name : `${prefix}/${name}`)
    nextPath = undefined
    if (type !== '0' && type !== '\0') continue
    const parts = fullPath.split('/').filter(part => part !== '' && part !== '.')
    if (fullPath.startsWith('/') || parts.includes('..')) throw new Error(`tarball entry leaves the package: ${fullPath}`)
    const path = parts.slice(1).join('/')
    if (path === '') continue
    files.push({ path, content: new Uint8Array(content), executable: (readOctal(block, 100, 8) & 0o111) !== 0 })
  }
  return files
}

/** The Subresource Integrity form npm and pnpm record: `sha512-<base64>`. */
export function integrityOf(bytes: Uint8Array): string {
  return `sha512-${createHash('sha512').update(bytes).digest('base64')}`
}
