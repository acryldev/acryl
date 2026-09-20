/**
 * Generated maps for the pack (spec 037): the mount-point map (where a plugin can put things on CLI, Web and
 * Desktop) and the plugin taxonomy (every row composed on any surface, classified by what it does). Both are
 * derived from real sources so they cannot drift by hand: the slot contracts (`interface SlotMap`), the composed
 * loader rows per surface (scripts/data/census-*.json) and each package's own source. Dev-time only: run through
 * scripts/sync-corpus.mjs; the results are committed.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

const SKIP = new Set(['node_modules', 'lib', 'dist', '.git', 'tests', 'test', 'test-support'])

function walk(dir, depth, visit) {
  if (depth < 0) return
  let names
  try { names = readdirSync(dir) } catch { return }
  for (const name of names) {
    if (SKIP.has(name) || name.startsWith('.')) continue
    const full = join(dir, name)
    let st
    try { st = statSync(full) } catch { continue }
    if (st.isDirectory()) walk(full, depth - 1, visit)
    else visit(full, name)
  }
}

/** name -> { dir, pkg, rel } for every package under the harness, plugins and apps. */
export function indexPackages(repo) {
  const index = new Map()
  for (const base of [join(repo, 'deepseek-harness/packages'), join(repo, 'plugins'), join(repo, 'apps'), join(repo, 'runtime')]) {
    walk(base, 5, (file, name) => {
      if (name !== 'package.json') return
      try {
        const pkg = JSON.parse(readFileSync(file, 'utf8'))
        if (typeof pkg.name === 'string' && !index.has(pkg.name)) index.set(pkg.name, { dir: dirname(file), pkg, rel: relative(repo, dirname(file)) })
      } catch { /* not a manifest */ }
    })
  }
  return index
}

function sourceFiles(dir) {
  const out = []
  walk(join(dir, 'src'), 4, (file, name) => { if (/\.(ts|tsx|js|mjs)$/u.test(name) && !/\.(test|spec)\./u.test(name)) out.push(file) })
  if (out.length === 0 && existsSync(join(dir, 'index.js'))) out.push(join(dir, 'index.js'))
  return out
}

const read = file => { try { return readFileSync(file, 'utf8') } catch { return '' } }

// ---------------------------------------------------------------- slots

/** Every `interface SlotMap` entry declared in source: name, kind, scope, owner, first doc line, declaring package. */
export function collectSlots(repo, index) {
  const slots = new Map()
  const roots = [join(repo, 'deepseek-harness/packages/client'), join(repo, 'apps/acryl-desktop/src/client'), join(repo, 'plugins')]
  const files = []
  for (const root of roots) walk(root, 7, (file, name) => { if (/\.(ts|tsx)$/u.test(name) && !/\.(test|spec)\./u.test(name)) files.push(file) })
  const packageOf = file => {
    let best
    for (const [name, info] of index) if (file.startsWith(`${info.dir}/`) && (!best || info.dir.length > best.dir.length)) best = { name, dir: info.dir }
    return best?.name ?? 'unknown'
  }
  for (const file of files) {
    const text = read(file)
    const block = /interface SlotMap \{/gu
    let m
    while ((m = block.exec(text)) !== null) {
      let depth = 1
      let i = block.lastIndex
      const start = i
      while (i < text.length && depth > 0) { if (text[i] === '{') depth += 1; else if (text[i] === '}') depth -= 1; i += 1 }
      const body = text.slice(start, i - 1)
      const entry = /(?:\/\*\*([\s\S]*?)\*\/\s*)?'([A-Za-z0-9.\-]+)':\s*\{([\s\S]*?)\}(?=\s*(?:\/\*\*|'[A-Za-z0-9.\-]+':|$))/gu
      let e
      while ((e = entry.exec(body)) !== null) {
        const doc = (e[1] ?? '').split('\n').map(l => l.replace(/^\s*\*?\s?/u, '').trim()).filter(Boolean)[0] ?? ''
        const spec = e[3]
        const kind = /kind:\s*'([a-z]+)'/u.exec(spec)?.[1]
        const scope = /scope:\s*'([a-z-]+)'/u.exec(spec)?.[1]
        const owner = /owner:\s*([A-Za-z_][\w<>,\s.[\]]*)/u.exec(spec)?.[1]?.trim().replace(/\s+/gu, ' ')
        if (kind && !slots.has(e[2])) slots.set(e[2], { name: e[2], kind, scope, owner, doc: doc.replace(/\s+/gu, ' '), declaredBy: packageOf(file) })
      }
    }
  }
  // Who fills each slot: packages whose source registers or injects into it by literal name.
  const fillers = new Map([...slots.keys()].map(k => [k, new Set()]))
  for (const file of files) {
    const text = read(file)
    if (!/slots\.(register|inject)/u.test(text)) continue
    for (const name of slots.keys()) if (text.includes(`'${name}'`)) fillers.get(name).add(packageOf(file))
  }
  for (const [name, set] of fillers) slots.get(name).filledBy = [...set].sort()
  return [...slots.values()].sort((a, b) => a.name.localeCompare(b.name))
}

// ---------------------------------------------------------------- roles

const ROLE_RULES = [
  ['tool', /tools\.register\(|defineTool\(/u],
  ['chat-command', /commands\.register\(/u],
  ['llm-adapter', /registerAdapter\(/u],
  ['prompt-contribution', /systemPrompt\.(section|register|add)|registerSection\(|\.section\(\{/u],
  ['skill-provider', /skills\.registerProvider|registerSkillProvider/u],
  ['subagent-provider', /subagents\.register\(/u],
  ['agent-preset', /agentPresets|dsh-agent-presets|persona/u],
  ['settings-section', /settings\.installSection|registerSection\(.*settings|settings\.register/u],
  ['host-route', /@Remote|\.route\(|registerRoute|webServer\./u],
  ['event-hook', /ctx\.on\(|\.on\('[a-z]/u],
  ['client-slot', /slots\.(register|inject)\(/u],
  ['tui-command', /tuiCommands/u],
  ['sandbox-or-terminal-backend', /sandbox|Sandbox|terminal\.register|spawnTerminal/u],
  ['storage-or-persistence', /SessionStore|persistence|sqlite|\.jsonl|storage\.register/u],
  ['schedule-job-workflow', /schedule\.|jobs\.|workflow|webhook/u],
  ['protocol-bridge', /\bmcp\b|\bacp\b|\blsp\b|JSON-RPC/iu],
]

function providedServices(text) {
  const out = new Set()
  for (const m of text.matchAll(/super\(\s*ctx\s*,\s*'([A-Za-z0-9.\-_]+)'/gu)) out.add(m[1])
  for (const m of text.matchAll(/ctx\.provide\(\s*'([A-Za-z0-9.\-_]+)'/gu)) out.add(m[1])
  for (const m of text.matchAll(/reflect\.provide\(\s*'([A-Za-z0-9.\-_]+)'/gu)) out.add(m[1])
  return [...out]
}

function injectedServices(text) {
  const m = /export const inject\s*=\s*(\[[^\]]*\]|\{[\s\S]*?\})/u.exec(text)
  if (!m) return []
  return [...m[1].matchAll(/'([A-Za-z0-9.\-_]+)'/gu)].map(x => x[1])
}

/** Primary taxonomy type, most specific first. */
const PRIMARY_ORDER = [
  'client-slot', 'tui-command', 'llm-adapter', 'tool', 'chat-command', 'skill-provider', 'prompt-contribution', 'subagent-provider', 'agent-preset',
  'settings-section', 'host-route', 'sandbox-or-terminal-backend', 'storage-or-persistence', 'schedule-job-workflow', 'protocol-bridge', 'event-hook',
]

const DESKTOP_MAIN_ROWS = {
  'acryl-desktop/terminal': 'Desktop main-process integrated terminal (PTY) service.',
  'acryl-desktop/hello-world': 'Desktop hello-world sample plugin (reference for Desktop host plugins).',
  'acryl-desktop/diagnostics': 'Desktop diagnostics export and crash evidence.',
  'acryl-desktop/notifications': 'Desktop native OS notifications.',
  'acryl-desktop/pnpm': 'Desktop package-manager service (desktopPnpm): runs dsh/pnpm operations in the active profile.',
  'acryl-desktop/profiles': 'Desktop profile service (desktopProfiles): current profile, list, select, delete.',
  'acryl-desktop/updates': 'Desktop application update service.',
  'acryl-desktop/webserver': 'Desktop-owned web server host for the renderer.',
  'dsh-desktop-loader-smoke-plugin': 'Loader smoke-test plugin used by the Desktop boot verification.',
}

/** Name-pattern classification for the harness's own naming convention; the source scan is the fallback. */
const NAME_RULES = [
  [/dsh-client-ui-|\/ui-|dsh-client-file-upload|dsh-client-resources|dsh-client-theme/u, 'client-slot'],
  [/dsh-client-|dsh-typert-client/u, 'client-service'],
  [/dsh-tool-/u, 'tool'],
  [/dsh-command-/u, 'chat-command'],
  [/dsh-llm-|llm-deepseek|llm-pi-ai/u, 'llm-adapter'],
  [/dsh-subagent-/u, 'subagent-provider'],
  [/dsh-agent-presets|dsh-persona/u, 'agent-preset'],
  [/dsh-terminal|dsh-bash-sandbox|dsh-sandbox|dsh-subprocess|dsh-e2b/u, 'sandbox-or-terminal-backend'],
  [/dsh-api-/u, 'host-route'],
  [/dsh-session-log|dsh-storage|dsh-persistence|dsh-spill/u, 'storage-or-persistence'],
  [/dsh-(schedule|jobs|workflow|webhook)/u, 'schedule-job-workflow'],
  [/dsh-(mcp|acp|lsp)/u, 'protocol-bridge'],
  [/dsh-(hooks|guard|approval)/u, 'event-hook'],
  [/dsh-skill/u, 'skill-provider'],
]

export function classifyRow(name, index, surfaces) {
  if (DESKTOP_MAIN_ROWS[name]) return { name, package: name, rel: 'apps/acryl-desktop', description: DESKTOP_MAIN_ROWS[name], kind: 'host', roles: [], primary: 'desktop-main', provides: [], injects: [], surfaces }
  // Sub-path rows (`pkg/feature`) belong to their package.
  let info = index.get(name)
  let lookup = name
  if (!info && name.includes('/')) { const cut = name.slice(0, name.lastIndexOf('/')); if (index.has(cut)) { info = index.get(cut); lookup = cut } }
  if (name.startsWith('cordis:') || name.startsWith('@deepseek-ai/cordis-plugin') || name === 'cordis-plugin-market' && false) {
    return { name, package: name, rel: 'core', description: 'Cordis loader infrastructure (entry groups, include, timer, HMR).', kind: 'core', roles: [], primary: 'core-infrastructure', provides: [], injects: [], surfaces }
  }
  if (!info) return { name, package: name, rel: '?', description: '(package not found in this checkout)', kind: 'unknown', roles: [], primary: 'unknown', provides: [], injects: [], surfaces }
  const files = sourceFiles(info.dir)
  const text = files.map(read).join('\n')
  const roles = ROLE_RULES.filter(([, re]) => re.test(text)).map(([role]) => role)
  const client = info.pkg.dsh?.client !== undefined || /client/u.test(info.rel) || /-client-/u.test(lookup)
  let description = String(info.pkg.description ?? '').trim()
  if (description === '') {
    const readme = read(join(info.dir, 'README.md'))
    description = /^description:\s*"?(.+?)"?\s*$/mu.exec(readme)?.[1] ?? ''
  }
  const provides = providedServices(text)
  const injects = injectedServices(text)
  let primary = NAME_RULES.find(([re]) => re.test(lookup))?.[1] ?? PRIMARY_ORDER.find(role => roles.includes(role))
  if (!primary) primary = provides.length > 0 ? 'service-provider' : client ? 'client-service' : 'other'
  return { name, package: name, rel: info.rel, description: description.replace(/\s+/gu, ' ').slice(0, 160), kind: client ? 'client' : 'host', roles, primary, provides: provides.slice(0, 6), injects: injects.slice(0, 8), surfaces }
}

// ---------------------------------------------------------------- data

export function loadRows(dataDir) {
  const surfaces = new Map()
  const add = (name, surface) => { if (!surfaces.has(name)) surfaces.set(name, new Set()); surfaces.get(name).add(surface) }
  for (const entry of JSON.parse(readFileSync(join(dataDir, 'census-tui-web.json'), 'utf8'))) for (const row of entry.entries) add(row.name, entry.label)
  for (const row of JSON.parse(readFileSync(join(dataDir, 'census-desktop.json'), 'utf8')).entries) add(row.id, 'desktop')
  return surfaces
}

// ---------------------------------------------------------------- rendering

const cell = text => String(text ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ')
const short = name => name.replace(/^@deepseek-ai\//u, '')
const surfaceMark = set => ['tui', 'web', 'desktop'].map(s => (set.has(s) ? s : '-')).join(' ')

export function renderMountPoints(slots, hostSeams) {
  const web = slots
  const lines = [
    '# Mount points: where a plugin can put things, per surface',
    '',
    '<!-- Generated by scripts/sync-corpus.mjs from the SlotMap declarations in source. Do not edit. -->',
    '',
    'ACRYL has three surfaces. A plugin has two halves: a **host** half (Node, `apply(ctx)`, all surfaces) and, for',
    'Web and Desktop, an optional **browser** half (`client.js`, slots). Pick the mount point first, then read its doc.',
    '',
    '## Which surface can show what',
    '',
    '| I want to add | CLI (terminal) | Web | Desktop |',
    '| --- | --- | --- | --- |',
    '| A visible UI element (button, panel, tab, card) | a **TUI command overlay** (`tuiCommands.register`, opened with a slash command) | a **client slot** (table below) | the same client slots as Web, plus the Desktop frame slots |',
    '| A whole page or full-screen view | a full-screen overlay (`tuiCommands` without an `overlay` hint) | a header button opening a fixed `inset: 0` panel | the `desktop.main` frame slot (replaces the main surface) or the same panel |',
    '| A model-callable tool | yes (`tools`) | yes | yes |',
    '| A chat slash command | yes (`commands.register`) | yes | yes |',
    '| Text in the system prompt, skills | yes | yes | yes |',
    '| A new model provider | yes (`llm`) | yes | yes |',
    '| A backend HTTP/RPC route | no web server | yes (`webServer`, typert remote) | yes |',
    '| Native OS integration (menus, notifications, windows) | no | no | Desktop main only (`desktopProfiles`, `desktopPnpm`, Electron); not agent-authorable without the main-process API |',
    '',
    '## Host mount points (every surface unless noted)',
    '',
    '| Mount point | Service and call | What you contribute | Doc |',
    '| --- | --- | --- | --- |',
    ...hostSeams.map(s => `| ${cell(s.mount)} | ${cell(s.call)} | ${cell(s.what)} | ${cell(s.doc)} |`),
    '',
    '## CLI (terminal) presentation',
    '',
    'The terminal has ONE plugin presentation seam: `ctx.get(\'tuiCommands\')?.register({ command: \'/name\', description, packageName, overlay?, open({ tui, close }) })`.',
    '`open()` returns a real `pi-tui` `Component` shown as an overlay (full screen by default; pass `overlay: { width, anchor, margin }`',
    'for a compact popup). It is read once when the TUI starts, so a new command appears after the TUI restarts (or `/reload` then',
    'reopen). The built-in overlays (`/model`, `/plugins`, `/tools`, `/trajectory`, ...) are not replaceable. Everything else the CLI',
    'shows (chat, tool cards, status) is built in. Example: `examples/packages/tui-command-basic/`; doc: `extending/tui-command.md`.',
    '',
    '## Web and Desktop: client slots',
    '',
    'Declared in source as `interface SlotMap` and listed here from those declarations. **Kind**: `single` (one occupant, replaces),',
    '`list` (many, ordered by `order`), `keyed` (one per `key`), `chain` (selector-routed). **Scope**: `root` (once for the app),',
    '`session` (per open conversation), `session-maybe` (also present with no session). Register from `client.js` with',
    '`ctx.slots.inject(name, () => ctx.slots.register({ name, id, order }, Component))` (see `extending/client-slot.md`). A slot whose',
    'owner props are non-trivial needs those props: read its declaring package in `reference/subsystems/` before using it. Verified',
    'working examples: `conversation.session.header.actions` (header-action) and `sidebar.right.pane.tab` (sidebar-tab).',
    '',
    `${web.length} slots:`,
    '',
    '| Slot | Kind | Scope | Owner props | Where / what | Declared by | Filled by (built-in) |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...web.map(s => `| \`${s.name}\` | ${s.kind} | ${s.scope ?? ''} | ${cell(s.owner ?? '')} | ${cell(s.doc)} | ${cell(short(s.declaredBy))} | ${cell((s.filledBy ?? []).map(short).join(', '))} |`),
    '',
    'Desktop adds its own frame slots (`desktop.main`, `sidebar`, `conversation`, `details`, `shell.overlay`) in advanced mode; they are',
    'in the table above from `apps/acryl-desktop/src/client/contracts.ts`. On Web these frame slots do not exist; the upstream slots do.',
    '',
  ]
  return lines.join('\n')
}

export function renderTaxonomy(rows, typeGuide) {
  const bySurface = s => rows.filter(r => r.surfaces.has(s)).length
  const groups = new Map()
  for (const row of rows) { if (!groups.has(row.primary)) groups.set(row.primary, []); groups.get(row.primary).push(row) }
  const order = [...groups.keys()].sort((a, b) => groups.get(b).length - groups.get(a).length)
  const lines = [
    '# Plugin taxonomy: every row composed on any surface',
    '',
    '<!-- Generated by scripts/sync-corpus.mjs from the composed loader rows (scripts/data/census-*.json) and each package\'s own source. Do not edit. -->',
    '',
    `${rows.length} distinct plugin packages are composed across the three surfaces (CLI ${bySurface('tui')}, Web ${bySurface('web')}, Desktop ${bySurface('desktop')} rows).`,
    'Each is classified by what its source does (its **primary type**). The **surfaces** column reads `tui web desktop`, `-` where',
    'absent. "Host" runs in Node on the surface; "client" runs in the browser (Web and Desktop only).',
    '',
    '## How to read this for authoring',
    '',
    'Find the type of thing you want to build, then read the doc and copy the example in the guide table. The plugins listed under',
    'that type are the real, shipped implementations to study (their source is in the repository; their contracts are in `reference/`).',
    '',
    '## Type guide: can an agent create one, and how',
    '',
    '| Type | Count | Can be authored as a local plugin? | Doc | Example | Notes |',
    '| --- | --- | --- | --- | --- | --- |',
    ...order.map(t => { const g = typeGuide[t] ?? { can: 'see notes', doc: '', example: '', notes: '' }; return `| ${t} | ${groups.get(t).length} | ${cell(g.can)} | ${cell(g.doc)} | ${cell(g.example)} | ${cell(g.notes)} |` }),
    '',
  ]
  for (const type of order) {
    lines.push(`## ${type} (${groups.get(type).length})`, '', '| Package | Kind | Surfaces (tui web desktop) | What it is | Provides | Needs |', '| --- | --- | --- | --- | --- | --- |')
    for (const row of groups.get(type).sort((a, b) => a.name.localeCompare(b.name))) {
      lines.push(`| ${cell(short(row.name))} | ${row.kind} | ${surfaceMark(row.surfaces)} | ${cell(row.description)} | ${cell(row.provides.join(', '))} | ${cell(row.injects.join(', '))} |`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------- theme tokens

/** Every `--dsw-alias-*` design token with its light and dark value, from the theme package's own stylesheet. */
export function collectThemeTokens(repo) {
  const css = read(join(repo, 'deepseek-harness/packages/client/ui-theme/src/styles/design-platform.css'))
  const blocks = [...css.matchAll(/^(body(?:\[data-ds-dark-theme\])?) \{([\s\S]*?)^\}/gmu)].map(m => ({ selector: m[1], body: m[2] }))
  const parse = body => new Map([...body.matchAll(/^\s*(--dsw-alias-[a-z0-9-]+):\s*([^;]+);/gmu)].map(m => [m[1], m[2].trim()]))
  const light = new Map()
  const dark = new Map()
  for (const block of blocks) {
    const target = block.selector.includes('dark') ? dark : light
    for (const [name, value] of parse(block.body)) target.set(name, value)
  }
  const names = [...new Set([...light.keys(), ...dark.keys()])].sort()
  return names.map(name => ({ name, light: light.get(name) ?? '', dark: dark.get(name) ?? '' }))
}

export function renderThemeTokens(tokens) {
  const lines = [
    '# Theme tokens: every `--dsw-alias-*` design token (Web and Desktop)',
    '',
    '<!-- Generated by scripts/sync-corpus.mjs from the theme package stylesheet. Do not edit. -->',
    '',
    'These are the CSS custom properties the app styles read. Override one with `ctx.theme.overrideTokens(sourceId, { \'--dsw-alias-brand-primary\': { light: \'#e8590c\', dark: \'#ff922b\' } })`',
    'in a client plugin (both modes are mandatory), or ship a whole theme with `ctx.theme.register({ id, colorScheme, tokens })`. See',
    '`extending/ui-theme.md`. Values shown reference the static palette (`--dsw-static-*`) unless they are literal colors. Also overridable:',
    '`--dsw-font-family` (UI font), `--dsh-content-font-size` (conversation text size, via `ctx.theme.setFontSize(px)`), corner and shadow',
    'tokens (`--dsw-shadow-*`, `--dsw-elevation-*`).',
    '',
    `${tokens.length} alias tokens:`,
    '',
    '| Token | Light | Dark |',
    '| --- | --- | --- |',
    ...tokens.map(t => `| \`${t.name}\` | ${cell(t.light)} | ${cell(t.dark)} |`),
    '',
  ]
  return lines.join('\n')
}
