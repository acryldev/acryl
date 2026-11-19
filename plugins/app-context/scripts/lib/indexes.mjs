/**
 * Human and agent readable indexes generated from the manifest (ported from
 * ACRYL's acryl-plugin-context, spec 037 FR-001). Generated, never hand-edited, so an index cannot disagree with
 * the manifest.
 */

const cell = text => String(text).replaceAll('|', '\\|').replaceAll('\n', ' ')

export function renderDocsIndex(manifest) {
  const lines = [
    '# Building this app: the docs',
    '',
    '<!-- Generated from docs.json by scripts/build-manifest.mjs. Do not edit here. -->',
    '',
    'Read the file for your topic BEFORE implementing. Read it completely, follow its',
    'cross-references and the example it names. Do not guess from memory of a similar',
    'plugin. Verified working examples: `../example-plugins/README.md`.',
    '',
    'The rule: every feature is a Cordis plugin of its own, `plugins/<name>/` plus its row in',
    '`blend.yaml`. Never wire a feature into `src/frame.ts`, `src/app.ts` or `src/routes.ts`.',
    '',
  ]
  for (const group of manifest.navigation) {
    lines.push(`## ${cell(group.title)}`, '', '| Doc | Read it when | Surfaces | Applies |', '| --- | --- | --- | --- |')
    for (const doc of group.items) lines.push(`| [${cell(doc.title)}](${doc.path}) | ${cell(doc.when)} | ${doc.surfaces.join(' ')} | ${doc.applies} |`)
    lines.push('')
  }
  return lines.join('\n')
}

export function renderExamplesIndex(manifest) {
  const lines = [
    '# Example plugins',
    '',
    '<!-- Generated from docs/docs.json by scripts/build-manifest.mjs. Do not edit here. -->',
    '',
    'Every example is a real plugin folder. The pack gate copies each one into an app\'s',
    '`plugins/`, mounts it by its row with the app\'s router and home page, and checks the',
    'outcome its scenario declares (`scenarios.json`). Find the closest, read every file of',
    'it, then copy it to `plugins/<your-name>/` and adapt it.',
    '',
    '| Example | Type | Teaches | Surfaces | Docs |',
    '| --- | --- | --- | --- | --- |',
  ]
  for (const example of manifest.examples) {
    lines.push(`| [${cell(example.id)}](packages/${example.path}/) | ${example.type} | ${cell(example.teaches)} | ${example.surfaces.join(' ')} | ${example.docs.join(', ')} |`)
  }
  lines.push('')
  return lines.join('\n')
}
