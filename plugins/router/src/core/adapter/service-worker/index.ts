/**
 * Service Worker Adapter for Acryl.
 * @module
 */
import type { Acryl } from '../../app.ts'
import type { Env, Schema } from '../../types.ts'
import { handle } from './handler.ts'
import type { HandleOptions } from './handler.ts'

/**
 * Registers a Acryl app to handle fetch events in a service worker.
 * This sets up `addEventListener('fetch', handle(app, options))` for the provided app.
 *
 * @param app - The Acryl application instance
 * @param options - Options for handling requests (fetch defaults to undefined)
 * @example
 * ```ts
 * import { Acryl } from 'acrylblends'
 * import { fire } from 'acrylblends/service-worker'
 *
 * const app = new Acryl()
 *
 * app.get('/', (c) => c.text('Hi'))
 *
 * fire(app)
 * ```
 */
const fire = <E extends Env, S extends Schema, BasePath extends string>(
  app: Acryl<E, S, BasePath>,
  options?: HandleOptions
): void => {
  // @ts-expect-error addEventListener is not typed well in ServiceWorker-like contexts, see: https://github.com/microsoft/TypeScript/issues/14877
  addEventListener('fetch', handle(app, options))
}

export { handle, fire }
