import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
// @ts-expect-error a plain .mjs script without types
import { withWorkbenchRoot } from '../scripts/ade-root.mjs'

const generated = `- insert:
    - id: acryl-versions
      name: '@acryldev/versions'
    - id: acryl-blends-frame
      name: '@acryldev/blends-frame'
      config:
        appPage: /app
    - id: acryl-plugin-admin
      name: '@acryldev/plugin-admin'
`

test('the generated frame row becomes the workbench row, and nothing else changes', () => {
  const swapped = withWorkbenchRoot(generated)
  assert.equal(
    swapped,
    generated.replace(
      "    - id: acryl-blends-frame\n      name: '@acryldev/blends-frame'\n      config:\n        appPage: /app\n",
      "    - id: acryl-workspace\n      name: '@acryldev/workspace'\n      config:\n        openFolder: !!js process.env.ACRYL_OPEN_FOLDER\n",
    ),
  )
  assert.equal(withWorkbenchRoot(swapped), swapped)
})

test('a desktop product names the frame by its source name, and gets the workbench by its source name', () => {
  const packed = generated.replaceAll("'@acryldev/blends-frame'", 'acryl-blends-frame')
  assert.equal(
    withWorkbenchRoot(packed),
    packed.replace(
      '    - id: acryl-blends-frame\n      name: acryl-blends-frame\n      config:\n        appPage: /app\n',
      '    - id: acryl-workspace\n      name: acryl-workspace\n      config:\n        openFolder: !!js process.env.ACRYL_OPEN_FOLDER\n',
    ),
  )
})

test('a workbench row written before openFolder gets it, once', () => {
  const old = "    - id: acryl-workspace\n      name: '@acryldev/workspace'\n    - id: next\n"
  const once = withWorkbenchRoot(old)
  assert.equal(once, "    - id: acryl-workspace\n      name: '@acryldev/workspace'\n      config:\n        openFolder: !!js process.env.ACRYL_OPEN_FOLDER\n    - id: next\n")
  assert.equal(withWorkbenchRoot(once), once)
})

test('the app as shipped mounts the workbench at the root', () => {
  const overlay = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  assert.match(withWorkbenchRoot(overlay), /- id: acryl-workspace\n +name: '@acryldev\/workspace'/u)
  assert.doesNotMatch(withWorkbenchRoot(overlay), /blends-frame'/u)
})
