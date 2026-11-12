import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
// @ts-expect-error a plain .mjs script without types
import { withWorkbenchRoot } from '../scripts/ade-root.mjs'

const generated = `- insert:
    - id: acryl-versions
      name: '@acrylblends/versions'
    - id: acryl-blends-frame
      name: '@acrylblends/blends-frame'
      config:
        appPage: /app
    - id: acryl-plugin-admin
      name: '@acrylblends/plugin-admin'
`

test('the generated frame row becomes the workbench row, and nothing else changes', () => {
  const swapped = withWorkbenchRoot(generated)
  assert.equal(
    swapped,
    generated.replace(
      "    - id: acryl-blends-frame\n      name: '@acrylblends/blends-frame'\n      config:\n        appPage: /app\n",
      "    - id: acryl-workspace\n      name: '@acrylblends/workspace'\n",
    ),
  )
  assert.equal(withWorkbenchRoot(swapped), swapped)
})

test('the app as shipped mounts the workbench at the root', () => {
  const overlay = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  assert.match(withWorkbenchRoot(overlay), /- id: acryl-workspace\n +name: '@acrylblends\/workspace'/u)
  assert.doesNotMatch(withWorkbenchRoot(overlay), /blends-frame'/u)
})
