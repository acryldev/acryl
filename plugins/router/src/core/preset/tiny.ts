/**
 * @module
 * The preset that uses `PatternRouter`.
 */

import { AcrylBase } from '../app-base.ts'
import type { AcrylOptions } from '../app-base.ts'
import { PatternRouter } from '../router/pattern-router/index.ts'
import type { BlankEnv, BlankSchema, Env, Schema } from '../types.ts'

export class Acryl<
  E extends Env = BlankEnv,
  S extends Schema = BlankSchema,
  BasePath extends string = '/',
> extends AcrylBase<E, S, BasePath> {
  constructor(options: AcrylOptions<E> = {}) {
    super(options)
    this.router = new PatternRouter()
  }
}
