import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { addReleases, entryOf, missingImages, plain, presentVersions } from './sites.mjs'

const NOTES = `# 1.2.3

A short intro with **bold** and a [link](https://x.test).

## Added

- **First thing.** It does \`this\`, and \`that\`
  across two lines.
- Second thing.

\`\`\`ts
const left = out
\`\`\`

## Things to know

One paragraph of its own.
`

test('plain keeps the words and drops the marks', () => {
  assert.equal(
    plain('**bold** and `code` and [a link](https://x.test) and *it*'),
    'bold and code and a link and it',
  )
})

test('a release-notes file becomes an intro and sections of one entry per bullet or paragraph, without code', () => {
  assert.deepEqual(entryOf(NOTES, '1.2.3'), {
    intro: 'A short intro with bold and a link.',
    body: [
      {
        heading: 'Added',
        paragraphs: ['First thing. It does this, and that across two lines.', 'Second thing.'],
      },
      { heading: 'Things to know', paragraphs: ['One paragraph of its own.'] },
    ],
  })
})

test('missing releases are added newest first above the newest the site has, and the list gets their items; a second pass adds nothing', () => {
  const doc =
    'export const docs = {\n  "framework/release-notes-0-9-1": {\n    intro: "x",\n    body: [],\n  },\n}\n'
  const content = '{ items: ["A", "Release notes 0.9.1", "B"] }'
  const first = addReleases(doc, content, {
    '0.8.0': 'old',
    '0.9.1': 'x',
    '0.10.0': '# 0.10.0\n\nOne.\n\n## New\n\n- Thing\n',
    '0.11.0': '# 0.11.0\n\nTwo.\n\n## New\n\n- Other\n',
  })
  assert.deepEqual(first.added, ['0.11.0', '0.10.0'])
  assert.deepEqual(first.gaps, ['0.8.0'])
  assert.deepEqual(presentVersions(first.docContent), ['0.11.0', '0.10.0', '0.9.1'])
  assert.ok(
    first.content.includes('"Release notes 0.11.0", "Release notes 0.10.0", "Release notes 0.9.1"'),
  )
  assert.match(first.docContent, /intro: "Two\."/u)
  const second = addReleases(first.docContent, first.content, {
    '0.9.1': 'x',
    '0.10.0': 'y',
    '0.11.0': 'z',
  })
  assert.deepEqual(second.added, [])
  assert.equal(second.docContent, first.docContent)
})

test('a site whose layout changed is reported, not guessed at', () => {
  assert.throws(
    () => addReleases('nothing here', '{}', { '1.0.0': '# 1.0.0\n' }),
    /no release-notes entry/u,
  )
})

test('missingImages finds a picture a synced page shows and the site does not have', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sites-images-'))
  try {
    const docs = join(dir, 'src', 'docs', 'framework')
    const publicDir = join(dir, 'public')
    mkdirSync(join(docs, 'workshop'), { recursive: true })
    mkdirSync(join(publicDir, 'docs-assets', 'workshop'), { recursive: true })
    writeFileSync(join(publicDir, 'docs-assets', 'workshop', 'there.webp'), 'x')
    writeFileSync(join(docs, 'workshop', 'local.png'), 'x')
    writeFileSync(
      join(docs, 'workshop', 'README.md'),
      [
        '![ok](/docs-assets/workshop/there.webp)',
        '![also ok](local.png "a title")',
        '![absent](/docs-assets/workshop/gone.webp)',
        '![absent too](./nope.png)',
        '![out of the site](/../../etc/passwd)',
        '![elsewhere](https://example.test/a.png)',
        '```md',
        '![code](/docs-assets/in-a-fence.webp)',
        '```',
      ].join('\n'),
    )
    assert.deepEqual(missingImages(docs, publicDir), [
      { page: 'workshop/README.md', image: '/docs-assets/workshop/gone.webp' },
      { page: 'workshop/README.md', image: './nope.png' },
      { page: 'workshop/README.md', image: '/../../etc/passwd' },
    ])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
