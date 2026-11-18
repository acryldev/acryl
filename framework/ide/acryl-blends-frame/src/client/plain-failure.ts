/**
 * A request the Host refused, in the words it chose for the person: `message` is the plain sentence, `details` what the tool said (shown behind a
 * "Details" toggle for developers). A Host that answered without a sentence gets a plain one here, never a status line.
 */
export class PlainFailure extends Error {
  readonly details: string | undefined
  constructor(message: string, details?: string) {
    super(message)
    this.name = 'PlainFailure'
    this.details = details
  }
}

/** The failure a refused response carries. */
export async function failureOf(response: Response): Promise<PlainFailure> {
  try {
    const body = await response.json() as { error?: unknown; details?: unknown }
    if (typeof body.error === 'string') return new PlainFailure(body.error, typeof body.details === 'string' ? body.details : undefined)
  } catch {
    // Not JSON: the fallback below says it.
  }
  return new PlainFailure('Something went wrong, and nothing was changed. Try again in a moment.', `HTTP ${String(response.status)}`)
}
