#!/usr/bin/env node
// Write the table of entries into README.md between the entries markers, from index.json.  node scripts/listing.mjs <registry folder>
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(process.argv[2] ?? '.')
const { entries } = JSON.parse(readFileSync(join(root, 'index.json'), 'utf8'))
const cell = (text) =>
  String(text ?? '')
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ')
const table = [
  '| Entry | By | What it is |',
  '| --- | --- | --- |',
  ...entries
    .filter((entry) => entry.runtime === 'acrylblends')
    .map(
      (entry) =>
        `| [\`${entry.id}\`](${entry.path}/) | ${cell(entry.id.split('.')[0])} | ${cell(entry.description ?? entry.name)} |`,
    ),
].join('\n')
const file = join(root, 'README.md')
const text = readFileSync(file, 'utf8')
const next = text.replace(
  /<!-- entries:start -->[\s\S]*<!-- entries:end -->/u,
  `<!-- entries:start -->\n${table}\n<!-- entries:end -->`,
)
if (next === text && !text.includes('<!-- entries:start -->'))
  throw new Error('README.md has no entries markers')
writeFileSync(file, next)
