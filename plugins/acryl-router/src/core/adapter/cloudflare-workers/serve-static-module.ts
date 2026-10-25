// For ES module mode
import type { Env, MiddlewareHandler } from '../../types.ts'
import type { ServeStaticOptions } from './serve-static.ts'
import { serveStatic } from './serve-static.ts'

const module = <E extends Env = Env>(
  options: Omit<ServeStaticOptions<E>, 'namespace'>
): MiddlewareHandler => {
  return serveStatic<E>(options)
}

export { module as serveStatic }
