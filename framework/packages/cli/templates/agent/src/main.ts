import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { selectInstance } from '../plugins/instance/index.ts'
import { MODEL_FILE, modelConfigFrom, modelConfigFromFile } from '../plugins/openai/index.ts'
import { createApp } from './app.ts'
import { APP_NAME } from './routes.ts'

// The composition root: the one place that reads the environment. selectInstance chooses where the app lives;
// modelConfigFrom picks a real model when ACRYLBLENDS_MODEL_URL and ACRYLBLENDS_MODEL are set (ACRYLBLENDS_MODEL_KEY for hosted APIs); without them, the model kept in the app's
// home (model.json, readable by its owner only) is used, so a started app needs no flag.
const chosen = selectInstance({
  projectRoot: fileURLToPath(new URL('..', import.meta.url)),
  env: process.env,
})
const model = modelConfigFrom(process.env) ?? modelConfigFromFile(join(chosen.home, MODEL_FILE))
const app = await createApp(chosen, model ? { model } : {})
console.log(
  `${APP_NAME} listening on ${app.url} (data in ${chosen.home}; model: ${model ? `${model.model} at ${model.baseUrl}` : 'offline scripted'})`,
)

const stop = async () => {
  await app.stop()
  console.log('stopped')
  process.exit(0)
}
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
