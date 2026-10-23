import type { Handler, Middleware, RouteContext } from './types.ts'

/**
 * Run `middleware` in order around `final`. Each middleware receives `next`, which runs the rest of the chain and
 * resolves to its response. Calling `next` twice in one middleware is a programming error and rejects.
 */
export function compose(middleware: readonly Middleware[], final: Handler): Handler {
  return (c: RouteContext): Promise<Response> => {
    const dispatch = async (index: number): Promise<Response> => {
      const current = middleware[index]
      if (current === undefined) return final(c)
      let called = false
      return current(c, () => {
        if (called) return Promise.reject(new Error('router: next() called more than once'))
        called = true
        return dispatch(index + 1)
      })
    }
    return dispatch(0)
  }
}
