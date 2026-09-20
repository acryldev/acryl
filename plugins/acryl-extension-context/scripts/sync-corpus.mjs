#!/usr/bin/env node
/**
 * Corpus sync (spec 037 T022): copies the DeepSeek Harness subsystem, Cordis API and cookbook docs, and ACRYL's
 * own Cordis guides, into docs/reference/ with provenance, and rewrites the "Reference" group of docs/docs.json.
 * Idempotent: running it twice produces no diff. English sources only. Em dashes become plain dashes.
 *
 *   node scripts/sync-corpus.mjs
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const pack = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repo = resolve(pack, '../..')
const harness = join(repo, 'deepseek-harness')
const commit = dir => execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const commits = { 'deepseek-harness': commit(harness), acryl: commit(repo) }

const english = name => name.endsWith('.md') && !name.endsWith('.zh.md')
const list = (base, dir, only) => readdirSync(join(base, dir)).filter(english).filter(n => !only || only.includes(n)).map(n => `${dir}/${n}`)

const groups = [
  { id: 'subsystems', title: 'Harness subsystems', repoName: 'deepseek-harness', base: harness, files: list(harness, 'docs/subsystems'), out: 'reference/subsystems' },
  { id: 'cordis-api', title: 'Cordis API', repoName: 'deepseek-harness', base: harness, files: list(harness, 'docs/cordis-api'), out: 'reference/cordis-api' },
  { id: 'cookbook', title: 'Harness cookbook', repoName: 'deepseek-harness', base: harness, files: list(harness, 'docs/cookbook', [
    'extension-cookbook.md', 'adding-a-tool.md', 'adding-an-llm-adapter.md', 'adding-a-settings-card.md', 'adding-a-remote-api.md', 'adding-a-package.md']), out: 'reference/cookbook' },
  { id: 'harness', title: 'Harness architecture', repoName: 'deepseek-harness', base: harness, files: [
    'cordis-primer', 'capability-seams', 'glossary', 'defensive-patterns', 'event-producer-consumer', 'tool-execution-pipeline', 'agent-lifecycle', 'architecture', 'config-catalog', 'tool-catalog',
  ].map(n => `docs/${n}.md`), out: 'reference/harness' },
  { id: 'cordis-guides', title: 'Cordis guides', repoName: 'acryl', base: repo, files: [
    'docs/cordis/cordis-usage-cheatsheet.md', 'docs/cordis/cordis_system_guide_for_coding_agents.md', 'docs/cordisplugins/hello-world-plugin-guide.md', 'docs/cordisplugins/development-canvas-plugin.md',
  ], out: 'reference/cordis-guides' },
]

const clean = text => text.replaceAll('—', '-').replaceAll('–', '-')
const firstHeading = text => /^#\s+(.+)$/mu.exec(text)?.[1]?.trim()
const firstSentence = text => {
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#') || line.startsWith('<!--') || line.startsWith('>') || line.startsWith('|') || line.startsWith('```') || line.startsWith('- ') || line.startsWith('---')) continue
    return line.length > 150 ? `${line.slice(0, 147)}...` : line
  }
  return undefined
}

rmSync(join(pack, 'docs/reference'), { recursive: true, force: true })
const items = []
for (const group of groups) {
  for (const rel of group.files) {
    const source = clean(readFileSync(join(group.base, rel), 'utf8'))
    const name = basename(rel)
    const outRel = `${group.out}/${name}`
    const header = `<!-- Synced from ${group.repoName}:${rel} @ ${commits[group.repoName].slice(0, 10)}. Do not edit; run scripts/sync-corpus.mjs. Relative links inside may not resolve here. -->\n\n`
    mkdirSync(dirname(join(pack, 'docs', outRel)), { recursive: true })
    writeFileSync(join(pack, 'docs', outRel), header + source)
    const title = firstHeading(source) ?? name.replace(/\.md$/u, '')
    items.push({
      id: `reference.${group.id}.${name.replace(/\.md$/u, '').toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '')}`,
      title: `${group.title}: ${title}`.slice(0, 120),
      path: outRel,
      when: firstSentence(source) ?? `Reference for ${title}.`,
      surfaces: ['tui', 'web', 'desktop'],
      applies: 'partial',
      source: { sourceRepo: group.repoName, sourcePath: rel, sourceCommit: commits[group.repoName].slice(0, 10) },
    })
  }
}

const manifestPath = join(pack, 'docs/docs.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
manifest.navigation = manifest.navigation.filter(g => g.title !== 'Reference (synced)')
manifest.navigation.push({ title: 'Reference (synced)', items })
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`sync-corpus: ${items.length} reference docs`)
