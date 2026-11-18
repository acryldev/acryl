/** The workspace terminal routes: start, snapshot, input, resize and close, for the app's own page only. The output streams over the PTY WebSocket. */

import { Acryl } from 'acrylblends'
import { INVALID_JSON, failure, isRecord, jsonBody, ownPage, readJson, type ReportError } from '../private-route.ts'
import type { WorkspacePtyRegistry } from './service.ts'
import {
  WORKSPACE_PTY_CLOSE_PATH,
  WORKSPACE_PTY_INPUT_PATH,
  WORKSPACE_PTY_PATH,
  WORKSPACE_PTY_RESIZE_PATH,
} from './contract.ts'

const START_KEYS = new Set(['commandId', 'cwd', 'cols', 'rows'])

/**
 * GET `pty?id=` (the session's snapshot) and POST `pty` `{ commandId, cwd?, cols?, rows? }` (start one); POST `input` `{ id, data }`, `resize`
 * `{ id, cols, rows }` and `close` `{ id }` (idempotent) for a live session.
 */
export function ptyRoutes(registry: WorkspacePtyRegistry, reportError: ReportError): Acryl {
  return new Acryl()
    .get(WORKSPACE_PTY_PATH, ownPage, (c) => {
      const id = c.req.query('id')
      if (id === undefined || id.length === 0) return c.json(failure('invalid workspace PTY request'), 400)
      try {
        return c.json(registry.read(id))
      } catch (cause) {
        reportError('read workspace PTY', cause)
        return c.json(failure('unknown workspace PTY session'), 404)
      }
    })
    .post(WORKSPACE_PTY_PATH, ownPage, jsonBody(), async (c) => {
      const body = await readJson(c)
      if (body === INVALID_JSON || !isRecord(body) || Object.keys(body).some(key => !START_KEYS.has(key))
        || typeof body.commandId !== 'string' || body.commandId.length === 0 || body.commandId.length > 32
        || (body.cwd !== undefined && (typeof body.cwd !== 'string' || body.cwd.length === 0))) {
        return c.json(failure('invalid workspace PTY request'), 400)
      }
      const size = typeof body.cols === 'number' && typeof body.rows === 'number' ? { cols: body.cols, rows: body.rows } : undefined
      if ((body.cols !== undefined || body.rows !== undefined) && size === undefined) return c.json(failure('invalid workspace PTY request'), 400)
      try {
        return c.json(await registry.start(body.commandId, body.cwd as string | undefined, size))
      } catch (cause) {
        reportError('start workspace PTY', cause)
        return c.json(failure(cause instanceof Error ? cause.message : 'workspace PTY spawn failed'), 500)
      }
    })
    .post(WORKSPACE_PTY_INPUT_PATH, ownPage, jsonBody(), async (c) => {
      const body = await readJson(c)
      if (!isRecord(body) || typeof body.id !== 'string' || typeof body.data !== 'string' || Object.keys(body).length !== 2) {
        return c.json(failure('invalid workspace PTY input'), 400)
      }
      try {
        registry.write(body.id, body.data)
        return c.json({ accepted: true })
      } catch (cause) {
        reportError('write workspace PTY', cause)
        return c.json(failure('unknown workspace PTY session'), 404)
      }
    })
    .post(WORKSPACE_PTY_RESIZE_PATH, ownPage, jsonBody(), async (c) => {
      const body = await readJson(c)
      if (!isRecord(body) || typeof body.id !== 'string'
        || typeof body.cols !== 'number' || typeof body.rows !== 'number'
        || !Number.isInteger(body.cols) || !Number.isInteger(body.rows)
        || body.cols < 2 || body.cols > 500 || body.rows < 1 || body.rows > 200
        || Object.keys(body).length !== 3) {
        return c.json(failure('invalid workspace PTY resize'), 400)
      }
      try {
        registry.resize(body.id, body.cols, body.rows)
        return c.json({ accepted: true })
      } catch (cause) {
        reportError('resize workspace PTY', cause)
        return c.json(failure('unknown workspace PTY session'), 404)
      }
    })
    .post(WORKSPACE_PTY_CLOSE_PATH, ownPage, jsonBody(), async (c) => {
      const body = await readJson(c)
      if (!isRecord(body) || typeof body.id !== 'string' || Object.keys(body).length !== 1) return c.json(failure('invalid workspace PTY close'), 400)
      try {
        await registry.close(body.id)
        return c.json({ accepted: true })
      } catch (cause) {
        reportError('close workspace PTY', cause)
        return c.json(failure('workspace PTY could not be closed'), 500)
      }
    })
}
