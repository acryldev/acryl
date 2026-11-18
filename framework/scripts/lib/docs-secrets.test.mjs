// The secrets scan must catch a planted fake key in the folders it covers, and stay quiet on a clean tree.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const script = join(dirname(fileURLToPath(import.meta.url)), '..', 'verify-docs-secrets.mjs')

function scan(files) {
  const root = mkdtempSync(join(tmpdir(), 'secrets-scan-'))
  try {
    execFileSync('git', ['init', '-q'], { cwd: root })
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(join(root, path), text)
    }
    execFileSync('git', ['add', '-A'], { cwd: root })
    return spawnSync(process.execPath, [script], {
      env: { ...process.env, VERIFY_SECRETS_ROOT: root },
      encoding: 'utf8',
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

// Built from parts so no real-looking key sits in this file.
const FAKE = `const config = { ${'api' + 'Key'}: '${'sk-' + 'planted0123456789abcdefghijklmnop'}' }\n`

test('a planted key in the framework docs, a template and a package source is caught', () => {
  for (const path of [
    'docs/framework/guides/example.md',
    'packages/cli/templates/blank/src/a.ts',
    'packages/framework/src/jwt/index.ts',
  ]) {
    const result = scan({ [path]: FAKE })
    assert.equal(result.status, 1, `${path}: ${result.stdout}${result.stderr}`)
    assert.match(result.stderr, new RegExp(path.replace(/[.]/gu, '\\.')))
  }
})

test('a clean tree passes, and a key in a test file is not scanned', () => {
  const result = scan({
    'docs/framework/guides/example.md': 'const secret = process.env.JWT_SECRET!\n',
    'plugins/x/test/x.test.ts': FAKE,
  })
  assert.equal(result.status, 0, result.stderr)
})
