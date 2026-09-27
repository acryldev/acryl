#!/usr/bin/env node
/**
 * Create a new ACRYL instance from the framework's scaffold (spec 036):
 *
 *   node scripts/init-instance.mjs <folder> [--name "Orbit"] [--blueprint acryl.blank] [--accent '#e8590c'] [--tagline "..."] [--font "..."]
 *
 * The folder becomes a self-contained instance: it is the instance's ACRYL home, so it can be committed, copied, run beside any number of others and
 * deleted without touching anything else. Its name (the folder name: lowercase letters, digits, dashes) derives its port and app name.
 *
 *   <folder>/acryl.instance.yaml   the definition: which Blueprint it grows from, its brand, its rows        (commit)
 *   <folder>/extensions/           plugins this instance owns, built by you or by its agent                  (commit)
 *   <folder>/run.sh                start it:  ./run.sh web | desktop | cli
 *   <folder>/.dsh/, instance.json  what the runtime keeps                                                     (git-ignored)
 */
import { chmodSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BLUEPRINT_FILE, InstanceError, instanceName } from './lib/instances.mjs'
import { basename } from 'node:path'

const FRAMEWORK_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const KNOWN_BLUEPRINTS = ['acryl.blank', 'acryl.full']
const yamlString = value => JSON.stringify(String(value))   // a JSON string is a valid YAML scalar, and never needs guessing about quoting

/** Pure: every file of the scaffold, by relative path. */
export function scaffoldFiles(folder, options = {}, frameworkRoot = FRAMEWORK_ROOT) {
  const name = instanceName(basename(resolve(folder)))
  const blueprint = options.blueprint ?? 'acryl.blank'
  if (!KNOWN_BLUEPRINTS.includes(blueprint)) throw new InstanceError(`unknown blueprint ${JSON.stringify(blueprint)}; use ${KNOWN_BLUEPRINTS.join(' or ')}`)
  const title = options.name ?? name
  const brand = [
    `  name: ${yamlString(title)}`,
    ...(options.tagline ? [`  tagline: ${yamlString(options.tagline)}`] : []),
    ...(options.accent ? [`  accent: ${yamlString(options.accent)}`] : []),
    ...(options.accentDark ? [`  accentDark: ${yamlString(options.accentDark)}`] : []),
    ...(options.font ? [`  fontFamily: ${yamlString(options.font)}`] : []),
    ...(options.mark ? [`  mark: ${yamlString(options.mark)}`] : []),
  ].join('\n')
  return {
    [BLUEPRINT_FILE]: `# The definition of this ACRYL instance. The framework reads it at start-up; a typo stops start-up with a message naming it.
id: ${name}
name: ${yamlString(title)}
extends: ${blueprint}
brand:
${brand}
# Uncomment to add capabilities on top of the Blueprint (each is one ordinary, removable plugin):
# rows: [extension-context, system-prompt, ui-library, community-market]
`,
    'extensions/.gitkeep': '',
    '.gitignore': '# what the runtime keeps for this instance\n.dsh/\ninstance.json\n',
    'run.sh': `#!/usr/bin/env bash\n# Start this instance:  ./run.sh web | desktop | cli   (extra flags: --port 3105 --name "Other Name")\nset -euo pipefail\nexec node ${JSON.stringify(join(frameworkRoot, 'scripts/blank.mjs'))} "\${1:-web}" --dir "$(cd "$(dirname "$0")" && pwd)" "\${@:2}"\n`,
    'README.md': `# ${title}

An ACRYL instance, created from the ACRYL framework scaffold (Blueprint \`${blueprint}\`).

- \`./run.sh web\` (or \`desktop\`, \`cli\`) starts it. It has its own port, its own data and its own app name, so it runs beside any other instance.
- \`acryl.instance.yaml\` is its definition: brand, Blueprint, rows. Edit it and restart.
- \`extensions/\` holds plugins this instance owns. Ask its agent to build one ("build me a to-do list plugin"), or drop a plugin folder here.
- Commit this folder to keep or share the instance. \`.dsh/\` (sessions, settings, profile) stays local.
`,
  }
}

/** Write the scaffold. The folder must not exist or must be empty: an init never overwrites anything. */
export function writeScaffold(folder, options = {}, frameworkRoot = FRAMEWORK_ROOT) {
  const root = resolve(folder)
  if (existsSync(root) && readdirSync(root).length > 0) throw new InstanceError(`${root} is not empty; init only creates a new instance`)
  const files = scaffoldFiles(root, options, frameworkRoot)
  for (const [relative, content] of Object.entries(files)) {
    const target = join(root, relative)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
  chmodSync(join(root, 'run.sh'), 0o755)
  return { root, files: Object.keys(files) }
}

export function parseFlags(argv) {
  const flags = {}; const positional = []
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg.startsWith('--')) { positional.push(arg); continue }
    const [key, inline] = arg.slice(2).split('=')
    flags[key] = inline ?? argv[++i]
  }
  return { flags, positional }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { flags, positional } = parseFlags(process.argv.slice(2))
    if (positional.length !== 1) throw new InstanceError('usage: init-instance.mjs <folder> [--name "Orbit"] [--blueprint acryl.blank] [--accent "#e8590c"]')
    const { root } = writeScaffold(positional[0], { name: flags.name, blueprint: flags.blueprint, accent: flags.accent, accentDark: flags['accent-dark'], tagline: flags.tagline, font: flags.font, mark: flags.mark })
    process.stdout.write(`created ${root}\nstart it:  ${join(root, 'run.sh')} web\n`)
  } catch (error) {
    process.stderr.write(`init: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = error instanceof InstanceError ? 3 : 2
  }
}
