import { cpSync } from 'node:fs'

cpSync(new URL('../client.js', import.meta.url), new URL('../lib/client.js', import.meta.url))
