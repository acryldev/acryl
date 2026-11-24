// A fake npm for the install tests: it writes what a real install writes, so every rule runs in milliseconds on any OS.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** What npm install leaves: one file per dependency, the hidden lockfile written last. Calls are recorded with what node_modules held when it started. */
export function fakeNpm({ code = 0, alsoWrite } = {}) {
  const calls = []
  const npm = async (args, cwd) => {
    calls.push({ args, cwd, found: existsSync(join(cwd, 'node_modules', 'left-pad', 'index.js')) })
    if (code !== 0) return code
    const deps = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')).dependencies ?? {}
    for (const name of Object.keys(deps)) {
      const file = join(cwd, 'node_modules', name, 'index.js')
      if (!existsSync(file)) { mkdirSync(join(file, '..'), { recursive: true }); writeFileSync(file, `module.exports = '${name}'\n`) }
    }
    alsoWrite?.(cwd)
    // npm rewrites the hidden lockfile in place (finding 1): an append is what reaches a hard-linked copy.
    appendFileSync(join(cwd, 'node_modules', '.package-lock.json'), `{"from":"${cwd}"}\n`)
    return 0
  }
  return { npm, calls }
}

