import { cpSync } from 'node:fs'

cpSync(new URL('../client', import.meta.url), new URL('../lib/client', import.meta.url), {
  recursive: true,
})
