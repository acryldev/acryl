// prepack: ship the framework docs inside the package (every created app gets a copy); postpack: remove the copy again.
import { cpSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const from = fileURLToPath(new URL('../../docs/framework', import.meta.url))
const to = fileURLToPath(new URL('./docs', import.meta.url))

rmSync(to, { recursive: true, force: true })
if (process.argv[2] === 'copy') cpSync(from, join(to, 'framework'), { recursive: true })
