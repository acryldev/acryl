import { cpSync } from 'node:fs'

cpSync(new URL('../preload.cjs', import.meta.url), new URL('../lib/preload.cjs', import.meta.url))
cpSync(new URL('../assets', import.meta.url), new URL('../lib/assets', import.meta.url), {
  recursive: true,
})
