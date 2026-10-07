// Bun preload for E4: rewrites the `node:module` import in ACRYL's built host so it uses nodemodule-shim.mjs.
import { plugin } from 'bun'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
const shim = join(import.meta.dir, 'nodemodule-shim.mjs')
plugin({
  name: 'rewrite-node-module-import',
  setup(build) {
    build.onLoad({ filter: /(acryl-web\/lib\/(bin|index)\.js|acryl-harness-runtime\/lib\/index\.mjs)$/ }, args => {
      const text = readFileSync(args.path, 'utf8').replace(
        /import (Module, )?\{ ([^}]*) \} from "node:module";/,
        (_m, def, names) => `import ${def ?? ''}{ ${names} } from "${shim}";`,
      )
      return { contents: text, loader: 'js' }
    })
  },
})
