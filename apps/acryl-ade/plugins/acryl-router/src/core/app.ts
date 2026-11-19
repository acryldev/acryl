import { AcrylBase } from './app-base.ts'
import type { AcrylOptions } from './app-base.ts'
import { RegExpRouter } from './router/reg-exp-router/index.ts'
import { SmartRouter } from './router/smart-router/index.ts'
import { TrieRouter } from './router/trie-router/index.ts'
import type { BlankEnv, BlankSchema, Env, Schema } from './types.ts'

/**
 * The Acryl class extends the functionality of the AcrylBase class.
 * It sets up routing and allows for custom options to be passed.
 *
 * @template E - The environment type.
 * @template S - The schema type.
 * @template BasePath - The base path type.
 */
export class Acryl<
  E extends Env = BlankEnv,
  S extends Schema = BlankSchema,
  BasePath extends string = '/',
> extends AcrylBase<E, S, BasePath> {
  /**
   * Creates an instance of the Acryl class.
   *
   * @param options - Optional configuration options for the Acryl instance.
   */
  constructor(options: AcrylOptions<E> = {}) {
    super(options)
    this.router =
      options.router ??
      new SmartRouter({
        routers: [new RegExpRouter(), new TrieRouter()],
      })
  }
}
