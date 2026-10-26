/**
 * The `ctx.db` type for Cordis plugins: `import type {} from 'acryl-db/cordis'` beside `inject: ['db']`. Kept out of the root entry, so
 * plain code that uses the port never names Cordis.
 */

import type {} from '@deepseek-ai/cordis'
import type { Db } from './facade/database.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    db: Db
  }
}
