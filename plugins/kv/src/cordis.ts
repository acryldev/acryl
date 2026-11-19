/**
 * The `ctx.kv` type for Cordis plugins: `import type {} from 'acryl-kv/cordis'` beside `inject: ['kv']`. Kept out of the root entry, so
 * plain code that uses the port never names Cordis.
 */

import type {} from '@deepseek-ai/cordis'
import type { Kv } from './kv.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    kv: Kv
  }
}
