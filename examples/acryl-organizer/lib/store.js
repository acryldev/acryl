/**
 * The organizer's persistence gateway: one JSON file in the project (`<workspace>/.acryl/organizer.json`), so the data is per
 * project, readable by the user and the agent, and committable to git. Writes go through a temp file and a rename, so a crash
 * never leaves half a file. The domain never sees a path.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { emptyState } from './domain.js'

export function storeFor(exec) {
  const cwd = exec?.agent?.session?.header?.cwd
  if (typeof cwd !== 'string' || !isAbsolute(cwd)) throw new Error('this session has no workspace directory, so there is nowhere to keep the organizer data')
  return fileStore(join(cwd, '.acryl', 'organizer.json'))
}

export function fileStore(file) {
  return {
    file,
    load() {
      if (!existsSync(file)) return emptyState()
      const parsed = JSON.parse(readFileSync(file, 'utf8'))
      if (!parsed || !Array.isArray(parsed.todos) || !Array.isArray(parsed.meetings) || !Number.isInteger(parsed.nextId)) throw new Error(`${file} is not organizer data`)
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
