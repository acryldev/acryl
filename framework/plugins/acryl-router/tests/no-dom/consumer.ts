/**
 * A Host-only consumer: Node types and no DOM library. Typechecking this against the built `lib/types` proves every public entry point's
 * declarations stand without the DOM library, which a server plugin should not need to load.
 */

import type * as Router from 'acryl-router'
import type * as Client from 'acryl-router/client'
import type * as Helpers from 'acryl-router/helpers'
import type * as Middleware from 'acryl-router/middleware'

export type Entries = [typeof Router, typeof Client, typeof Helpers, typeof Middleware]
