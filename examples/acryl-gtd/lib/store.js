/**
 * The GTD plugin's persistence gateway: one JSON file in the project (`<workspace>/.acryl/gtd.json`), so the data is
 * per project, readable by the user and the agent, and committable to git. Writes go through a temp file and a
 * rename, so a crash never leaves half a file. The domain never sees a path. Same shape as acryl-organizer's store.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { emptyState } from './domain.js'

export function storeFor(exec) {
  const cwd = exec?.agent?.session?.header?.cwd
  if (typeof cwd !== 'string' || !isAbsolute(cwd)) throw new Error('this session has no workspace directory, so there is nowhere to keep the GTD data')
  return fileStore(join(cwd, '.acryl', 'gtd.json'))
}

export function fileStore(file) {
  return {
    file,
    load() {
      if (!existsSync(file)) return emptyState()
      const parsed = JSON.parse(readFileSync(file, 'utf8'))
      if (!parsed || !Array.isArray(parsed.items) || !Number.isInteger(parsed.nextId)) throw new Error(`${file} is not GTD data`)
      return parsed
    },
    save(state) {
      mkdirSync(dirname(file), { recursive: true })
      const temporary = `${file}.${process.pid}.tmp`
      writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`)
      renameSync(temporary, file)
    },
  }
}
