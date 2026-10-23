import type { Middleware } from '../types.ts'

/** One line to a sink the caller owns, for example `line => ctx.logger.info(line)`. */
export type LogSink = (line: string) => void

/** Log each request on the way in and its status and time on the way out. The sink is required: a framework does not write to the console on its own. */
export function logger(sink: LogSink): Middleware {
  return async (c, next) => {
    const label = `${c.req.method} ${c.url.pathname}`
    sink(`<-- ${label}`)
    const started = performance.now()
    try {
      const response = await next()
      sink(`--> ${label} ${String(response.status)} ${String(Math.round(performance.now() - started))}ms`)
      return response
    } catch (error) {
      sink(`--> ${label} threw ${error instanceof Error ? error.message : String(error)} ${String(Math.round(performance.now() - started))}ms`)
      throw error
    }
  }
}
