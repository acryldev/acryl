/**
 * Human and agent readable indexes generated from the manifest (spec 037
 * FR-001). Generated, never hand-edited, so an index cannot disagree with
 * the manifest.
 */

const cell = text => String(text).replaceAll('|', '\\|').replaceAll('\n', ' ')

export function renderDocsIndex(manifest) {
  const lines = [
    '# ACRYL extension docs',
    '',
    '<!-- Generated from docs.json by scripts/build-manifest.mjs. Do not edit here. -->',
    '',
    'Read the file for your topic BEFORE implementing. Read it completely, follow its',
    'cross-references and the example it names. Do not guess from memory of a similar',
    'plugin. Verified working examples: `../example-plugins/README.md`.',
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
    '# ACRYL extension examples',
    '',
    '<!-- Generated from docs/docs.json by scripts/build-manifest.mjs. Do not edit here. -->',
    '',
    'Every example is a real package. Each is mounted through the real Loader by the',
    'pack gate and its declared outcome observed. Find the closest, read it, then adapt it.',
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
