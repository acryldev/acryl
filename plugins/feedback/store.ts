/**
 * The notes people sent, in the app's own data: one JSON line per note in `notes.jsonl`, the ids the builder has seen in `seen.json`, and a note's
 * screenshot as a file in `shots/`. Appending never rewrites a note, so a crash loses at most the note being written; an image is written before its
 * note, so a note never names a missing file.
 */
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** The element a note was pinned on: a CSS selector to find it again, and a short name to show. */
export interface PinnedElement {
  readonly selector: string
  readonly label: string
}

export type ScreenshotMediaType = 'image/webp' | 'image/png'

/** A note's screenshot, as stored beside the notes. */
export interface FeedbackScreenshot {
  /** The file under `shots/`. */
  readonly file: string
  readonly mediaType: ScreenshotMediaType
  readonly width: number
  readonly height: number
  readonly bytes: number
}

/**
 * A note already pinned on an element of a page, as that page's own script sees it: where to find the element again and the number its badge
 * shows. It carries no note text, because anyone who opens the page can read this.
 */
export interface FeedbackPin {
  readonly selector: string
  readonly number: number
}

export interface FeedbackNote {
  readonly id: string
  /** ISO time it was sent. */
  readonly at: string
  readonly text: string
  /** The page's path (and query) it was sent from. */
  readonly page: string
  /** Absent for "Nothing specific". */
  readonly element?: PinnedElement
  /** What the person saw when they sent it; absent when the browser refused the capture. */
  readonly screenshot?: FeedbackScreenshot
  /** The builder has seen it in the frame. */
  readonly seen: boolean
}

/** One screenshot as the page sent it, decoded and checked. */
export interface NewScreenshot {
  readonly mediaType: ScreenshotMediaType
  readonly width: number
  readonly height: number
  readonly data: Buffer
}

export interface NewNote {
  readonly text: string
  readonly page: string
  readonly element?: PinnedElement
  readonly screenshot?: NewScreenshot
}

/** A stored screenshot's bytes and type. */
export interface StoredScreenshot {
  readonly bytes: Buffer
  readonly mediaType: ScreenshotMediaType
}

export const LIMITS = {
  text: 2000,
  page: 500,
  selector: 500,
  label: 120,
  /** Decoded image bytes; the page downscales and re-encodes below this. */
  screenshotBytes: 512 * 1024,
  screenshotSide: 2000,
} as const

const DATA_URL = /^data:(image\/(?:webp|png));base64,([A-Za-z0-9+/]+={0,2})$/u
const NOTE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u

/** One screenshot from the page: a WebP or PNG data URL, its size, and the bytes. A string says what is wrong. */
export function parseScreenshot(value: unknown): NewScreenshot | string {
  if (typeof value !== 'object' || value === null) return 'the screenshot must be an object'
  const { data, width, height } = value as Record<string, unknown>
  if (typeof data !== 'string') return 'the screenshot has no image'
  const match = DATA_URL.exec(data)
  if (match === null || match[1] === undefined || match[2] === undefined)
    return 'the screenshot must be a WebP or PNG data URL'
  const mediaType = match[1] as ScreenshotMediaType
  const bytes = Buffer.from(match[2], 'base64')
  if (bytes.length === 0) return 'the screenshot is empty'
  if (bytes.length > LIMITS.screenshotBytes)
    return `a screenshot is at most ${String(Math.round(LIMITS.screenshotBytes / 1024))} KB`
  const webp =
    bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP'
  const png = bytes[0] === 0x89 && bytes.subarray(1, 4).toString() === 'PNG'
  if ((mediaType === 'image/webp' && !webp) || (mediaType === 'image/png' && !png))
    return 'the screenshot is not the image its type names'
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    (width as number) < 1 ||
    (height as number) < 1 ||
    (width as number) > LIMITS.screenshotSide ||
    (height as number) > LIMITS.screenshotSide
  )
    return `the screenshot needs its size, up to ${String(LIMITS.screenshotSide)} px a side`
  return { mediaType, width: width as number, height: height as number, data: bytes }
}

/** A note as a page sent it, checked; a string says what is wrong. */
export function parseNewNote(body: unknown): NewNote | string {
  if (body === null || typeof body !== 'object') return 'send a JSON object'
  const { text, page, element, screenshot } = body as Record<string, unknown>
  if (typeof text !== 'string' || text.trim() === '') return 'write a note'
  if (text.length > LIMITS.text) return `a note has at most ${LIMITS.text} characters`
  if (typeof page !== 'string' || !page.startsWith('/') || page.length > LIMITS.page)
    return 'the page must be a path'
  let pinned: PinnedElement | undefined
  if (element !== undefined && element !== null) {
    if (typeof element !== 'object') return 'the element must be an object'
    const { selector, label } = element as Record<string, unknown>
    if (typeof selector !== 'string' || selector === '' || selector.length > LIMITS.selector)
      return 'the element needs a selector'
    if (typeof label !== 'string' || label === '' || label.length > LIMITS.label)
      return 'the element needs a name'
    pinned = { selector, label }
  }
  let shot: NewScreenshot | undefined
  if (screenshot !== undefined && screenshot !== null) {
    const parsed = parseScreenshot(screenshot)
    if (typeof parsed === 'string') return parsed
    shot = parsed
  }
  return {
    text: text.trim(),
    page,
    ...(pinned === undefined ? {} : { element: pinned }),
    ...(shot === undefined ? {} : { screenshot: shot }),
  }
}

function storedScreenshot(raw: unknown): FeedbackScreenshot | undefined {
  if (raw === null || typeof raw !== 'object') return undefined
  const { file, mediaType, width, height, bytes } = raw as Record<string, unknown>
  if (
    typeof file !== 'string' ||
    (mediaType !== 'image/webp' && mediaType !== 'image/png') ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    !Number.isInteger(bytes)
  )
    return undefined
  return {
    file,
    mediaType,
    width: width as number,
    height: height as number,
    bytes: bytes as number,
  }
}

export class FeedbackStore {
  private readonly notesFile: string
  private readonly seenFile: string
  private readonly shotsDir: string
  /** Writes one after another, so two notes never interleave in the file. */
  private queue: Promise<unknown> = Promise.resolve()

  constructor(dir: string) {
    this.notesFile = join(dir, 'notes.jsonl')
    this.seenFile = join(dir, 'seen.json')
    this.shotsDir = join(dir, 'shots')
  }

  add(note: NewNote, now: Date = new Date()): Promise<FeedbackNote> {
    const id = randomUUID()
    const shot = note.screenshot
    const stored = {
      id,
      at: now.toISOString(),
      text: note.text,
      page: note.page,
      ...(note.element === undefined ? {} : { element: note.element }),
      ...(shot === undefined
        ? {}
        : {
            screenshot: {
              file: `${id}.${shot.mediaType === 'image/webp' ? 'webp' : 'png'}`,
              mediaType: shot.mediaType,
              width: shot.width,
              height: shot.height,
              bytes: shot.data.length,
            },
          }),
    }
    return this.serial(async () => {
      await mkdir(join(this.notesFile, '..'), { recursive: true })
      if (shot !== undefined) {
        // The image first: a note in the file always has its screenshot.
        await mkdir(this.shotsDir, { recursive: true })
        await writeFile(
          join(this.shotsDir, `${id}.${shot.mediaType === 'image/webp' ? 'webp' : 'png'}`),
          shot.data,
        )
      }
      await appendFile(this.notesFile, `${JSON.stringify(stored)}\n`)
      return { ...stored, seen: false }
    })
  }

  /** One note's screenshot, when it has one and the file is still there. */
  async screenshot(id: string): Promise<StoredScreenshot | undefined> {
    if (!NOTE_ID.test(id)) return undefined
    for (const [ext, mediaType] of [
      ['webp', 'image/webp'],
      ['png', 'image/png'],
    ] as const) {
      try {
        return { bytes: await readFile(join(this.shotsDir, `${id}.${ext}`)), mediaType }
      } catch {
        // Not this type; try the other.
      }
    }
    return undefined
  }

  /**
   * The pins of one page, for the badges its visitors see: the elements a note was pinned on, numbered in the order their first note came,
   * oldest first. One pin per element, so two notes on the same element share its badge, and the number of a pin never moves once it is given.
   */
  async pins(page: string): Promise<FeedbackPin[]> {
    const pins: FeedbackPin[] = []
    const taken = new Set<string>()
    for (const note of (await this.list()).reverse()) {
      const element = note.element
      if (note.page !== page || element === undefined || taken.has(element.selector)) continue
      taken.add(element.selector)
      pins.push({ selector: element.selector, number: pins.length + 1 })
    }
    return pins
  }

  /** Every note, newest first. A line that is not a note is skipped. */
  async list(): Promise<FeedbackNote[]> {
    if (!existsSync(this.notesFile)) return []
    const seen = await this.seen()
    const notes: FeedbackNote[] = []
    for (const line of (await readFile(this.notesFile, 'utf8')).split('\n')) {
      if (line.trim() === '') continue
      try {
        const raw = JSON.parse(line) as Omit<FeedbackNote, 'seen'> & {
          readonly screenshot?: unknown
        }
        if (
          typeof raw.id === 'string' &&
          typeof raw.at === 'string' &&
          typeof raw.text === 'string' &&
          typeof raw.page === 'string'
        ) {
          const { screenshot, ...rest } = raw
          const shot = storedScreenshot(screenshot)
          notes.push({
            ...rest,
            seen: seen.has(raw.id),
            ...(shot === undefined ? {} : { screenshot: shot }),
          })
        }
      } catch {
        // A torn last line: skipped.
      }
    }
    return notes.reverse()
  }

  markSeen(ids: readonly string[]): Promise<void> {
    return this.serial(async () => {
      const seen = await this.seen()
      for (const id of ids) seen.add(id)
      await mkdir(join(this.seenFile, '..'), { recursive: true })
      await writeFile(this.seenFile, JSON.stringify([...seen]))
    })
  }

  private async seen(): Promise<Set<string>> {
    try {
      const ids: unknown = JSON.parse(await readFile(this.seenFile, 'utf8'))
      return new Set(
        Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [],
      )
    } catch {
      return new Set()
    }
  }

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work)
    this.queue = next.catch(() => {})
    return next
  }
}
