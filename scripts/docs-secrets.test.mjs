import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { scan } from './verify-docs-secrets.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { findSecrets } = await import(pathToFileURL(join(root, 'runtime/app-persistence/dist/index.js')).href)
const kinds = text => scan([{ path: 'example.md', text }], findSecrets).map(finding => finding.kind)

test('the literals that landed before are found', () => {
  // The two regressions: ported JSDoc examples, then docs examples.
  for (const text of [
    "    password: 'acoolproject',",
    "const token = 'acrylblendsiscool'",
    "    secret: 'it-is-very-secret',",
    "  const secret = 'secret' // make sure it's a large enough string to be secure",
    'basicAuth({ username: "acrylblends", password: "acoolproject" })',
  ]) assert.ok(kinds(text).length > 0, text)
})

test('save\'s own scan runs too', () => {
  assert.ok(kinds("    secret: 'it-is-very-secret',").some(kind => kind.startsWith('save: ')))
})

test('examples that read the environment, types and prose are clean', () => {
  for (const text of [
    '    password: process.env.BASIC_AUTH_PASSWORD!,',
    'const secret = process.env.JWT_SECRET!',
    '#### **(required)** secret: `string`',
    'The token is checked on every request.',
    "app.use('/api/*', bearerAuth({ token: process.env.ADMIN_TOKEN ?? '' }))",
  ]) assert.deepEqual(kinds(text), [], text)
})
