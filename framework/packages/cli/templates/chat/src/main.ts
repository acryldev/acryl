import { fileURLToPath } from 'node:url'
import { selectInstance } from '../plugins/instance/index.ts'
import { createApp } from './app.ts'

// The composition root: the one place that reads the environment and chooses where the app lives.
const chosen = selectInstance({
  projectRoot: fileURLToPath(new URL('..', import.meta.url)),
  env: process.env,
})
const app = await createApp(chosen, {
  ...(process.env.CHAT_DB ? { database: process.env.CHAT_DB } : {}),
})
console.log(`listening on ${app.url} (data in ${chosen.home})`)

// Stop taking requests, let the ones in flight finish, then close the database (the db plugin does, when it is disposed) and exit.
const stop = async () => {
  const timer = setTimeout(() => process.exit(1), 10_000)
  timer.unref()
  await app.stop()
  process.exit(0)
}
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
