import { cpSync } from 'node:fs'

cpSync(new URL('../runner.mjs', import.meta.url), new URL('../lib/runner.mjs', import.meta.url))
