import { fileURLToPath } from 'node:url'
import { selectInstance } from '../plugins/instance/index.ts'
import { createApp } from './app.ts'
import { APP_NAME } from './routes.ts'

// The composition root: the one place that reads the environment (through selectInstance) and chooses where the app lives.
const chosen = selectInstance({
  projectRoot: fileURLToPath(new URL('..', import.meta.url)),
  env: process.env,
})
const app = await createApp(chosen)
console.log(`${APP_NAME} listening on ${app.url} (data in ${chosen.home})`)

const stop = async () => {
  await app.stop()
  console.log('stopped')
  process.exit(0)
}
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
