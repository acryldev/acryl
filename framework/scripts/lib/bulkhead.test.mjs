// Bulkheads (specs/049-framework-architecture/app-storage.md in ACRYL, after ACRYL's runtime/acryl-harness-runtime/tests/bulkhead.spec.ts): no shipped code
// outside the AppInstance family (plugins/instance) decides where an app keeps anything. Reading the home folder, asking Electron for a path or reading a
// placement variable anywhere else is how a run falls back to a shared folder: the Documents copy and a blanked app were both that.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))

/** What ships: the plugins an app is made of, the frame's packages, the CLI. Gates under scripts/ run on a developer's machine and may read its home. */
const ROOTS = ['plugins', 'ide', 'packages/cli/src', 'packages/create/src']

/** The only files allowed to, each with its reason. Anything else is a hidden global. */
const ALLOWED = {
  'plugins/instance/home.ts':
    "the one owner of the rule (T026): the person's home folder and ~/.acryl, where every app's data lives",
  'ide/acryl-workspace/src/pty/service.ts':
    "a terminal starts in the person's own home folder when its cwd is gone; not app state (as in ACRYL)",
  'packages/cli/src/preflight.ts':
    "the workshop preflight checks the person's machine (pi's key in its own folder); it runs before any app exists",
  // A ratchet, not exceptions: each repeats a rule the AppInstance family owns, and app-storage.md's slices 2 and 3 (the product host on its app folders)
  // remove it. The second test fails once a file no longer needs its line, so the list only shrinks.
  'plugins/desktop/frame.ts':
    "frameHome repeats selectInstance's ACRYLBLENDS_HOME rule; slice 2 takes the home from the AppInstance",
}

const AMBIENT = [
  { name: 'homedir()', pattern: /\bhomedir\(\)/u },
  { name: 'an Electron path', pattern: /\bapp\.getPath\(/u },
  {
    name: 'a placement variable read',
    pattern:
      /\benv(?:\.|\[['"])(ACRYLBLENDS_HOME|ACRYLBLENDS_DOCUMENTS|APPDATA|LOCALAPPDATA|XDG_DATA_HOME|XDG_CONFIG_HOME|USERPROFILE)\b(?!['"]?\]?\s*=(?!=))/u,
  },
]

function sources(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'lib', 'dist', 'tests', 'test', 'fixtures', 'vendor'].includes(entry.name))
      continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sources(path))
    else if (
      /\.(ts|tsx|mts|js|mjs)$/u.test(entry.name) &&
      !/\.(test|spec|case)\./u.test(entry.name)
    )
      out.push(path)
  }
  return out
}

test('only the AppInstance family decides where an app keeps anything', () => {
  const offences = []
  for (const root of ROOTS) {
    for (const file of sources(join(repo, root))) {
      const path = relative(repo, file).split(sep).join('/')
      if (path in ALLOWED) continue
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          if (/^\s*(\*|\/\/)/u.test(line)) return // comments may name them
          for (const rule of AMBIENT)
            if (rule.pattern.test(line))
              offences.push(
                `${path}:${String(index + 1)} ${rule.name}: ${line.trim().slice(0, 120)}`,
              )
        })
    }
  }
  assert.deepEqual(offences, [])
})

test('the allow-list names only files that exist and still need it', () => {
  for (const path of Object.keys(ALLOWED)) {
    assert.ok(statSync(join(repo, path)).isFile(), path)
    const text = readFileSync(join(repo, path), 'utf8')
    assert.ok(
      AMBIENT.some((rule) =>
        text.split('\n').some((line) => !/^\s*(\*|\/\/)/u.test(line) && rule.pattern.test(line)),
      ),
      `${path} no longer reads the home or a placement variable: remove it from ALLOWED`,
    )
  }
})
