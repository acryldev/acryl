import { cpSync } from 'node:fs'

// The build runs this after tsdown, and prepack runs it again: a lib/ rebuilt by tsdown alone (clean) lost these three, and 0.1.1 shipped without watch-host.mjs.
cpSync(new URL('../preload.cjs', import.meta.url), new URL('../lib/preload.cjs', import.meta.url))
// frame.ts starts the packaged host through it, from next to itself.
cpSync(
  new URL('../watch-host.mjs', import.meta.url),
  new URL('../lib/watch-host.mjs', import.meta.url),
)
cpSync(new URL('../assets', import.meta.url), new URL('../lib/assets', import.meta.url), {
  recursive: true,
})
