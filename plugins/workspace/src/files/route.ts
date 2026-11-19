/** The worktree file routes: two reads and two changes, for the app's own page only. */

import { Acryl, type Context } from 'acrylblends'
import { INVALID_JSON, failure, isRecord, jsonBody, ownPage, readJson, type ReportError } from '../private-route.ts'
import {
  MAX_EDITABLE_BYTES,
  WORKSPACE_FILES_ENTRY_PATH,
  WORKSPACE_FILES_READ_PATH,
  WORKSPACE_FILES_TREE_PATH,
  WORKSPACE_FILES_WRITE_PATH,
  parseFileEntryChange,
} from './contract.ts'
import { WorkspaceFilesError, type WorkspaceFiles } from './service.ts'

const STATUS = { invalid: 400, 'not-found': 404, conflict: 409, 'too-large': 413, failed: 500 } as const

function required(c: Context, name: string): string {
  const value = c.req.query(name)
  if (value === undefined || value.length === 0) throw new WorkspaceFilesError(`missing ${name}`, 'invalid')
  return value
}

/**
 * GET `tree?path=<worktree>&dir=<relative, empty for the root>` and `read?path=&file=`; POST `write` `{ path, file, content, expectedMtimeMs }`
 * to replace an existing file's text and `entry` `{ path, op: 'create' | 'rename' | 'delete', file, kind?, to? }` for one structural change.
 */
export function filesRoutes(files: WorkspaceFiles, reportError: ReportError): Acryl {
  const answer = async (c: Context, operation: string, compute: () => Promise<object>): Promise<Response> => {
    try {
      return c.json(await compute())
    } catch (cause) {
      if (cause instanceof WorkspaceFilesError) return c.json(failure(cause.message), STATUS[cause.kind])
      reportError(operation, cause)
      return c.json(failure('file request failed'), 500)
    }
  }
  return new Acryl()
    .get(WORKSPACE_FILES_TREE_PATH, ownPage, c => answer(c, 'list files', () => files.tree(required(c, 'path'), c.req.query('dir') ?? '')))
    .get(WORKSPACE_FILES_READ_PATH, ownPage, c => answer(c, 'read file', () => files.read(required(c, 'path'), required(c, 'file'))))
    .post(WORKSPACE_FILES_WRITE_PATH, ownPage, jsonBody(MAX_EDITABLE_BYTES + 64 * 1024), async (c) => {
      const body = await readJson(c)
      if (body === INVALID_JSON || !isRecord(body)
        || typeof body.path !== 'string' || typeof body.file !== 'string'
        || typeof body.content !== 'string' || typeof body.expectedMtimeMs !== 'number'
        || Object.keys(body).length !== 4) {
        return c.json(failure('invalid save request'), 400)
      }
      const { path, file, content, expectedMtimeMs } = body
      return answer(c, 'save file', () => files.write(path, file, content, expectedMtimeMs))
    })
    .post(WORKSPACE_FILES_ENTRY_PATH, ownPage, jsonBody(), async (c) => {
      const body = await readJson(c)
      const change = body === INVALID_JSON ? null : parseFileEntryChange(body)
      if (change === null || !isRecord(body) || typeof body.path !== 'string') return c.json(failure('invalid change request'), 400)
      const { path } = body
      return answer(c, 'change file', () => files.change(path, change))
    })
}
