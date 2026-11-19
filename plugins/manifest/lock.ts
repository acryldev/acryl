/**
 * `npm run lock`: write `blend.lock.json` (formatVersion 3, the lock ACRYL writes too) next to the manifest, recording what the app is
 * built from: the manifest's identity and digest, the Blueprint it was resolved over, its resolved parameters and rows, and a content
 * digest of every plugin folder in `plugins/`. Commit it; a diff of the lock is a review of
 * what changed.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  type BlendDocument,
  type BlendLock,
  digestFolder,
  generateBlendLock,
  type LockModule,
  manifestDigest,
  parseDefinition,
  resolveDefinition,
} from '@webboxes/blends-core'
import { blueprintsIn } from './index.ts'

export const LOCK_FILE = 'blend.lock.json'

type LockV3 = Extract<BlendLock, { formatVersion: 3 }>

function read(file: string): { text: string; document: BlendDocument } {
  const text = readFileSync(file, 'utf8')
  const { document, diagnostics } = parseDefinition(text)
  if (diagnostics.length > 0)
    throw new Error(`${file}:\n${diagnostics.map((d) => `${d.path}: ${d.message}`).join('\n')}`)
  return { text, document: document as BlendDocument }
}

function localModules(appRoot: string, folder: string): LockModule[] {
  const directory = join(appRoot, folder)
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      origin: 'local' as const,
      digest: `sha256:${digestFolder(join(directory, entry.name))}`,
      source: `${folder}/${entry.name}`,
    }))
}

export function writeLock(appRoot: string): LockV3 {
  const blendFile = join(appRoot, 'blend.yaml')
  const getBlueprint = blueprintsIn(join(appRoot, 'blueprints'))
  const { text, document } = read(blendFile)
  const resolved = resolveDefinition(document, {
    getDefinition: (id) => {
      const file = getBlueprint(id)
      return file === undefined ? undefined : read(file).document
    },
  })
  if (resolved.definition === null)
    throw new Error(
      `${blendFile}:\n${resolved.diagnostics.map((d) => `${d.path}: ${d.message}`).join('\n')}`,
    )
  // A Blend records the Blueprint file it was resolved over, so an upgrade shows up as a lock diff.
  const lineage = document.spec.lineage
  const blueprintFile = lineage ? getBlueprint(lineage.blueprint) : undefined
  const { lock } = generateBlendLock({
    resolved: resolved.definition,
    origin: {
      id: document.metadata.id,
      kind: document.kind,
      version: document.metadata.version,
      digest: manifestDigest(text),
    },
    modules: [
      ...localModules(appRoot, 'plugins'),
      ...localModules(appRoot, 'src/plugins'),
      ...localModules(appRoot, 'extensions'),
    ],
    ...(lineage
      ? {
          lineage: {
            ...lineage,
            ...(blueprintFile
              ? { digest: manifestDigest(readFileSync(blueprintFile, 'utf8')) }
              : {}),
          },
        }
      : {}),
  })
  writeFileSync(join(appRoot, LOCK_FILE), `${JSON.stringify(lock, null, 2)}\n`)
  return lock as LockV3
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const appRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
  const locked = writeLock(appRoot)
  console.log(
    `wrote ${LOCK_FILE}: ${locked.rows.length} rows, ${locked.modules.length} local plugins`,
  )
}
