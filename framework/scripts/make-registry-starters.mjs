#!/usr/bin/env node
// Make the acrylblends-native starters of the public registry from this checkout's templates, so what the registry offers is what `acrylblends init` makes today:
//   node scripts/make-registry-starters.mjs <registry folder> [--only <id>] [--cli <acrylblends.js>]
// `--only` makes one starter; `--cli` makes them with an installed `acrylblends` instead of this checkout's (the packed-install gate).
// Each starter is a whole app under blends/<id>/ (the app without node_modules, data and the framework docs, which `create-acrylblends` adds back), with a blend.yaml that validates
// for distribution (public, licensed, categorised, described) and an acryl.template.json, which is what marks an entry as an app for the acrylblends runtime.
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const registry = args[0] === undefined || args[0].startsWith('--') ? undefined : resolve(args[0])
const only = option('--only')
const cli = option('--cli') ?? join(root, 'packages', 'cli', 'bin', 'acrylblends.js')
if (registry === undefined || !existsSync(join(registry, 'index.json'))) {
  console.error(
    'usage: node scripts/make-registry-starters.mjs <registry folder with index.json> [--only <id>] [--cli <acrylblends.js>]',
  )
  process.exit(2)
}

const STARTERS = [
  {
    id: 'acrylblends.notes-desktop',
    name: 'Notes, in a window',
    template: 'notes',
    desktop: true,
    category: 'productivity',
    description:
      'A multi-user notes app (sign-up, log-in, search, SQLite with migrations) that opens in its own desktop window as well as in the browser.',
  },
  {
    id: 'acrylblends.chat',
    name: 'Chat',
    template: 'chat',
    desktop: false,
    category: 'ai',
    description:
      'An AI chat app: the answer streams token by token from an OpenAI-compatible API (DeepSeek by default), history in SQLite, a Stop button. Closed in production until it has an access token.',
  },
  {
    id: 'acrylblends.agent',
    name: 'An app that builds itself',
    template: 'agent',
    desktop: false,
    category: 'starter',
    description:
      'A small app with an offline agent and live plugin install: ask for a feature and the agent writes it into the running app, through the door. Development only: production leaves the agent out.',
  },
]

const work = mkdtempSync(join(tmpdir(), 'registry-starters-'))
try {
  for (const starter of STARTERS.filter(
    (candidate) => only === undefined || candidate.id === only,
  )) {
    const app = join(work, starter.template)
    const made = spawnSync(
      process.execPath,
      [
        cli,
        'init',
        app,
        '--template',
        starter.template,
        '--name',
        starter.id.split('.')[1],
        '-y',
        '--no-next',
        ...(starter.desktop ? ['--desktop'] : ['--bare']),
      ],
      { encoding: 'utf8' },
    )
    if (made.status !== 0)
      throw new Error(`init ${starter.template} failed:\n${made.stdout}${made.stderr}`)
    // What a registry entry does not carry: the framework docs (create-acrylblends adds them back), build output, data, and the agent's scratch.
    for (const drop of ['docs', 'node_modules', 'dist', 'data', '.acrylblends', '.acryl'])
      rmSync(join(app, drop), { recursive: true, force: true })
    // The dotfile the templates keep as `gitignore`, so it is not read as the registry's own.
    if (existsSync(join(app, '.gitignore')))
      renameSync(join(app, '.gitignore'), join(app, 'gitignore'))
    const manifestFile = join(app, 'blend.yaml')
    const text = readFileSync(manifestFile, 'utf8')
    const meta = /^metadata:\n(?:[ \t]+.*\n|[ \t]*\n)*/mu.exec(text)
    if (!meta) throw new Error(`${starter.template}: blend.yaml has no metadata block`)
    const block = [
      'metadata:',
      `  id: ${starter.id}`,
      `  name: ${JSON.stringify(starter.name)}`,
      '  version: 0.1.0',
      `  category: ${starter.category}`,
      `  description: ${JSON.stringify(starter.description)}`,
      '  license: MIT',
      '  visibility: public',
      '',
    ].join('\n')
    writeFileSync(manifestFile, text.replace(meta[0], block))
    writeFileSync(
      join(app, 'acryl.template.json'),
      `${JSON.stringify({ name: starter.name, description: starter.description, plugins: [] }, null, 2)}\n`,
    )
    const target = join(registry, 'blends', starter.id)
    rmSync(target, { recursive: true, force: true })
    mkdirSync(dirname(target), { recursive: true })
    cpSync(app, target, { recursive: true })
    console.log(
      `make-registry-starters: ${starter.id} (${starter.template}${starter.desktop ? ' + desktop' : ''})`,
    )
  }
} finally {
  rmSync(work, { recursive: true, force: true })
}
