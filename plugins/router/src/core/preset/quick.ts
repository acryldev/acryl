/**
 * @module
 * The preset that uses `LinearRouter`.
 */

import { AcrylBase } from '../app-base.ts'
import type { AcrylOptions } from '../app-base.ts'
import { LinearRouter } from '../router/linear-router/index.ts'
import { SmartRouter } from '../router/smart-router/index.ts'
import { TrieRouter } from '../router/trie-router/index.ts'
import type { BlankEnv, BlankSchema, Env, Schema } from '../types.ts'

export class Acryl<
  E extends Env = BlankEnv,
  S extends Schema = BlankSchema,
  BasePath extends string = '/',
> extends AcrylBase<E, S, BasePath> {
  constructor(options: AcrylOptions<E> = {}) {
    super(options)
    this.router = new SmartRouter({
      routers: [new LinearRouter(), new TrieRouter()],
    })
  }
}
