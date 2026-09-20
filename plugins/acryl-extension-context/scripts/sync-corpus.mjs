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
import { classifyRow, collectSlots, indexPackages, loadRows, renderMountPoints, renderTaxonomy } from './lib/maps.mjs'
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

// ---- generated maps: mount points and taxonomy (from source and the composed rows)
const HOST_SEAMS = [
  { mount: 'Tools', call: "ctx.tools.register(defineTool({...}))", what: 'a model-callable tool', doc: 'extending/tool-plugin.md, example tool-basic' },
  { mount: 'Chat slash commands', call: "ctx.commands.register({ name, description, handler })", what: 'a /command run on the host without the model', doc: 'extending/chat-command.md, example chat-command-basic' },
  { mount: 'System prompt', call: "ctx.systemPrompt.section({ name, order, text })", what: 'a prompt section (static text, or per-turn via PromptContext)', doc: 'extending/prompt-contribution.md' },
  { mount: 'Skills', call: "ctx.skills.registerProvider(() => provider)", what: 'on-demand skills (name and description in context, body on demand)', doc: 'extending/skill-provider.md' },
  { mount: 'Model providers', call: "ctx.llm.registerAdapter(['route'], adapter)", what: 'a new LLM provider route', doc: 'extending/llm-adapter.md, example llm-adapter-echo' },
  { mount: 'Events', call: "ctx.on(name, listener) / ctx.emit / waterfall", what: 'listen to or intercept harness events (tool policy, session events)', doc: 'extending/event-hook.md' },
  { mount: 'Settings sections', call: "ctx.settings.installSection(ctx, NS, Config, config, opts)", what: 'validated user-editable settings', doc: 'extending/config-schema.md, example settings-section-basic' },
  { mount: 'Agent presets and personas', call: 'a preset directory (agent.cordis.yml + preset.yml)', what: 'a different session composition or identity', doc: 'extending/agent-preset.md' },
  { mount: 'Subagent providers', call: "ctx.subagents.register(...)", what: 'a new way to run a delegated agent', doc: 'reference/subsystems/subagent.md (no example)' },
  { mount: 'Host routes (Web and Desktop)', call: "ctx.webServer route / typert @Remote", what: 'an HTTP or RPC endpoint for a browser half', doc: 'extending/host-route.md' },
  { mount: 'Services', call: "class X extends Service { constructor(ctx) { super(ctx, 'name') } }", what: 'a named capability others inject', doc: 'extending/service.md, extending/three-role-capability.md' },
  { mount: 'Terminal overlays (CLI only)', call: "ctx.get('tuiCommands')?.register({...})", what: 'a slash command that opens a pi-tui overlay', doc: 'extending/tui-command.md' },
  { mount: 'Profile and install (all surfaces, fuller on Desktop)', call: "ctx.get('desktopProfiles' | 'desktopPnpm' | 'livePluginActivation')", what: 'profile identity, package operations, live activation', doc: 'extending/desktop-main.md' },
]
const TYPE_GUIDE = {
  'client-slot': { can: 'yes (Web, Desktop)', doc: 'extending/client-slot.md', example: 'client-slot-header-action, client-slot-sidebar-tab', notes: '58 slots, see mount-points; slots with owner props need the declaring package doc' },
  'tool': { can: 'yes', doc: 'extending/tool-plugin.md', example: 'tool-basic', notes: '' },
  'chat-command': { can: 'yes', doc: 'extending/chat-command.md', example: 'chat-command-basic', notes: 'host command run without the model' },
  'llm-adapter': { can: 'yes', doc: 'extending/llm-adapter.md', example: 'llm-adapter-echo', notes: 'real providers need a key: never in the package' },
  'prompt-contribution': { can: 'yes', doc: 'extending/prompt-contribution.md', example: 'prompt-contribution-basic', notes: '' },
  'skill-provider': { can: 'yes', doc: 'extending/skill-provider.md', example: 'skill-provider-basic', notes: '' },
  'subagent-provider': { can: 'possible, advanced', doc: 'reference/subsystems/subagent.md', example: '(none)', notes: 'large contract (continuations, capabilities); ask the user first' },
  'agent-preset': { can: 'yes (directory, not a package)', doc: 'extending/agent-preset.md', example: 'agent-preset-reviewer', notes: 'structural only, a preset grants its plugins capabilities' },
  'settings-section': { can: 'yes', doc: 'extending/config-schema.md', example: 'settings-section-basic', notes: 'a browser card is optional (settings.plugin.item)' },
  'host-route': { can: 'yes (Web, Desktop)', doc: 'extending/host-route.md', example: 'host-route-basic', notes: 'the CLI has no web server' },
  'event-hook': { can: 'yes', doc: 'extending/event-hook.md', example: 'event-hook-basic', notes: 'a waterfall observer MUST call next()' },
  'sandbox-or-terminal-backend': { can: 'not for an agent to author', doc: 'reference/subsystems/sandbox.md', example: '(none)', notes: 'a security boundary: only with explicit user direction and review' },
  'storage-or-persistence': { can: 'not for an agent to author', doc: 'reference/subsystems/persistence.md', example: '(none)', notes: 'durable session format; a bug corrupts history' },
  'schedule-job-workflow': { can: 'yes as a consumer', doc: 'reference/subsystems/schedule.md', example: '(none)', notes: 'see also jobs.md, workflow.md, webhook.md' },
  'protocol-bridge': { can: 'possible, advanced', doc: 'reference/subsystems/extensions.md', example: '(none)', notes: 'MCP, ACP, LSP integrations are mostly configuration-driven' },
  'service-provider': { can: 'yes', doc: 'extending/service.md', example: 'service-provider-greeter, capability-swap-*', notes: '' },
  'client-service': { can: 'yes (browser half)', doc: 'extending/client-slot.md', example: '(client bundle can ctx.provide)', notes: 'not separately verified' },
  'tui-command': { can: 'yes (CLI)', doc: 'extending/tui-command.md', example: 'tui-command-basic', notes: '' },
  'desktop-main': { can: 'yes (Node in the Electron main process)', doc: 'extending/desktop-main.md', example: 'desktop-main-profile-info', notes: 'Electron APIs themselves are not verified for local plugins' },
  'core-infrastructure': { can: 'no', doc: 'reference/cordis-api/', example: '(none)', notes: 'Loader, include, timer, HMR: never author' },
  'other': { can: 'case by case', doc: 'extending/cordis-core.md', example: '(none)', notes: 'session projections and local attachment stores' },
}
const index = indexPackages(repo)
const slots = collectSlots(repo, index)
const surfacesByName = loadRows(join(pack, 'scripts/data'))
const rows = [...surfacesByName].map(([name, set]) => classifyRow(name, index, set))
mkdirSync(join(pack, 'docs/maps'), { recursive: true })
writeFileSync(join(pack, 'docs/maps/mount-points.md'), renderMountPoints(slots, HOST_SEAMS))
writeFileSync(join(pack, 'docs/maps/taxonomy.md'), renderTaxonomy(rows, TYPE_GUIDE))

const manifestPath = join(pack, 'docs/docs.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
manifest.navigation = manifest.navigation.filter(g => g.title !== 'Reference (synced)')
manifest.navigation = manifest.navigation.filter(g => g.title !== 'Maps (generated)')
manifest.navigation.splice(manifest.navigation.findIndex(g => g.title === 'Delivery') + 1, 0, {
  title: 'Maps (generated)',
  items: [
    { id: 'maps.mount-points', title: 'Mount points per surface: where UI and host extensions attach (CLI, Web, Desktop)', path: 'maps/mount-points.md', when: 'You must decide WHERE something mounts: which slot, terminal overlay, host service or Desktop frame, and which surface supports it.', surfaces: ['tui', 'web', 'desktop'], applies: 'all', seeAlso: ['extending.client-slot', 'extending.tui-command'] },
    { id: 'maps.taxonomy', title: 'Plugin taxonomy: every plugin type and every shipped plugin, per surface', path: 'maps/taxonomy.md', when: 'You want the full list of plugin types, which surfaces have them, whether an agent can author one, and real shipped plugins to study.', surfaces: ['tui', 'web', 'desktop'], applies: 'all', seeAlso: ['extending.cordis-core'] },
  ],
})
manifest.navigation.push({ title: 'Reference (synced)', items })
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`sync-corpus: ${items.length} reference docs, ${slots.length} slots, ${rows.length} plugin rows`)
