/**
 * A Host-only consumer: Node types and no DOM library. Typechecking this against the built `lib/types` proves every public entry point's
 * declarations stand without the DOM library, which a server plugin should not need to load.
 */

import type * as Router from '@acryldev/router'
import type * as Client from '@acryldev/router/client'
import type * as Helpers from '@acryldev/router/helpers'
import type * as Middleware from '@acryldev/router/middleware'

export type Entries = [typeof Router, typeof Client, typeof Helpers, typeof Middleware]
