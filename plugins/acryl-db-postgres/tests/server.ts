/**
 * Where the tests find a Postgres server, reached the way an app reaches one: over the network, through `pg`.
 *
 * - By default, PGlite (in memory) behind its socket server. Every connection shares PGlite's one backend session, which also ignores the
 *   startup `search_path`, so a case gets an empty database by dropping and recreating `public` in that throwaway server.
 * - With `ACRYL_DB_POSTGRES_URL` set, a real server. A case gets a schema of its own (`search_path` in the connection options), dropped
 *   afterwards, so the server's `public` schema and other data are never touched.
 */

import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import pg from 'pg'
import { inject } from 'vitest'

export interface TestServer {
  /** A connection string to an empty database, for one case. */
  fresh(): Promise<string>
  /** Open connections to the server right now; undefined on a real server, where other clients may be connected. */
  connections(): number | undefined
  stop(): Promise<void>
}

const REAL = process.env['ACRYL_DB_POSTGRES_URL']

export async function startTestServer(): Promise<TestServer> {
  if (REAL !== undefined && REAL !== '') return realServer(REAL)
  // The cluster `global-setup.ts` created once for the run: loading it skips initdb, most of a fresh PGlite's start.
  const db = await PGlite.create({ loadDataDir: new Blob([readFileSync(inject('pgliteDataDir'))]) })
  // Two: the case's own pool, and the reset between cases.
  const server = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1', maxConnections: 4 })
  await server.start()
  const url = `postgres://postgres@${server.getServerConn()}/postgres`
  return {
    fresh: async () => {
      await db.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
      return url
    },
    connections: () => server.getStats().activeConnections,
    stop: async () => {
      await server.stop()
      await db.close()
    },
  }
}

async function realServer(url: string): Promise<TestServer> {
  const admin = new pg.Client({ connectionString: url })
  await admin.connect()
  const schemas: string[] = []
  return {
    fresh: async () => {
      const schema = `acryl_conformance_${String(process.pid)}_${String(schemas.length)}`
      schemas.push(schema)
      await admin.query(`CREATE SCHEMA ${schema}`)
      const scoped = new URL(url)
      scoped.searchParams.set('options', `-c search_path=${schema}`)
      return scoped.href
    },
    connections: () => undefined,
    stop: async () => {
      for (const schema of schemas.splice(0)) await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin.end()
    },
  }
}
