import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const manifest = require('../package.json') as { readonly version: string }

/** Canonical ACRYL version string used by the CLI and the release smoke checks. */
export const ACRYL_VERSION = manifest.version
