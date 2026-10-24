/**
 * The 0.4 names, kept for one release so code written against them keeps working: `App` is now `Acryl` and `AppRequest` is now `AcrylRequest`,
 * the upstream names with the project renamed. Not part of the ported core; both the plugin's root and the public package's root export these.
 */

import { Acryl } from './core/app.ts'
import type { AcrylRequest } from './core/request.ts'
import type { BlankEnv, BlankSchema, Env, Input, Schema } from './core/types.ts'

/** @deprecated Use `Acryl` (`new Acryl()`); `App` is the 0.4 name and goes away in the next release. */
export const App = Acryl
/** @deprecated Use `Acryl`; `App` is the 0.4 name and goes away in the next release. */
export type App<E extends Env = BlankEnv, S extends Schema = BlankSchema, BasePath extends string = '/'> = Acryl<E, S, BasePath>
/** @deprecated Use `AcrylRequest`; `AppRequest` is the 0.4 name and goes away in the next release. */
export type AppRequest<P extends string = '/', I extends Input['out'] = {}> = AcrylRequest<P, I>
