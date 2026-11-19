/**
 * The retained tail of one terminal's output, addressed by an ever-growing cursor.
 *
 * The cursor is the total number of characters the process has written, so a client that remembers the
 * cursor it reached can ask for exactly what it missed, with no gap and no repeat. Only the tail is kept;
 * a client that fell behind the kept part is told to start over from the tail instead.
 */

export interface Replay {
  /** Output from the requested cursor (or from the start of the kept tail when `replace`). */
  readonly data: string
  /** The cursor after `data`. */
  readonly cursor: number
  /** True when the client must clear its terminal first: what it missed is no longer kept. */
  readonly replace: boolean
}

const DEFAULT_LIMIT = 1024 * 1024
/** After a cut, look this far for a line break so the tail does not start in the middle of a line. */
const LINE_SEARCH = 4096

export class Scrollback {
  private tail = ''
  private start = 0

  constructor(private readonly limit: number = DEFAULT_LIMIT) {}

  /** Total characters ever appended. */
  get cursor(): number {
    return this.start + this.tail.length
  }

  append(chunk: string): void {
    if (chunk.length === 0) return
    this.tail += chunk
    if (this.tail.length <= this.limit) return
    let cut = this.tail.length - this.limit
    const lineBreak = this.tail.indexOf('\n', cut)
    if (lineBreak !== -1 && lineBreak - cut < LINE_SEARCH) cut = lineBreak + 1
    this.tail = this.tail.slice(cut)
    this.start += cut
  }

  /** @param since - the cursor the client reached, or 0 for a fresh attach. */
  replay(since: number): Replay {
    if (since >= this.start && since <= this.cursor) {
      return { data: this.tail.slice(since - this.start), cursor: this.cursor, replace: false }
    }
    return { data: this.tail, cursor: this.cursor, replace: true }
  }
}
