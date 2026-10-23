/**
 * An error that carries the response it should become (Hono's `HTTPException`). A handler or middleware throws it to stop a request
 * with a status: `throw new HttpError(401, { message: 'Sign in first' })`. The router answers with `getResponse()`; a registered
 * `onError` handler still sees every other error.
 */
export class HttpError extends Error {
  readonly status: number
  private readonly response: Response | undefined

  constructor(status: number, options: { readonly message?: string, readonly response?: Response, readonly cause?: unknown } = {}) {
    super(options.message ?? `HTTP ${String(status)}`, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'HttpError'
    this.status = status
    this.response = options.response
  }

  /** The response this error stands for: the one it was given, or its message as plain text with its status. */
  getResponse(): Response {
    return this.response ?? new Response(this.message, { status: this.status, headers: { 'content-type': 'text/plain; charset=utf-8' } })
  }
}
