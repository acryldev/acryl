import { describeDbConformance } from 'acryl-db/conformance'
import { afterAll, beforeAll } from 'vitest'
import { openDb } from '../src/open.ts'
import { startTestServer, type TestServer } from './server.ts'

// Through `openDb`, over the network to PGlite's socket server (or the real server in ACRYL_DB_POSTGRES_URL): the driver the provider ships.
let server: TestServer
beforeAll(async () => { server = await startTestServer() })
afterAll(async () => { await server.stop() })

describeDbConformance('acryl-db-postgres', async () => openDb({ url: await server.fresh() }))
