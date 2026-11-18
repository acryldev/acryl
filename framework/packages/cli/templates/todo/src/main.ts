import { fileURLToPath } from 'node:url'
import { selectInstance } from '../plugins/instance/index.ts'
import { APP_NAME, createApp } from './app.ts'

// The composition root: the one place that reads the environment (through selectInstance) and chooses where the app lives.
const chosen = selectInstance({
  projectRoot: fileURLToPath(new URL('..', import.meta.url)),
  env: process.env,
})
const app = await createApp(chosen)
console.log(`${APP_NAME} listening on ${app.url} (data in ${chosen.home})`)
// The list is served under /todo, not at the address above: say where to open it.
console.log(`open ${app.url}/todo`)

const stop = async () => {
  await app.stop()
  console.log('stopped')
  process.exit(0)
}
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
