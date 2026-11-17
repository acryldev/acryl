/** `npm run save -- "message"`: save the app folder this file lives in. Prints the result; exits 1 when the save was refused. */
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { saveFolder } from './index.ts'

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const appRoot = fileURLToPath(new URL('../..', import.meta.url))
  const result = saveFolder(appRoot, process.argv.slice(2).join(' ').trim() || 'save the app')
  if (result.status === 'refused') {
    console.error(`not saved: ${result.reason}`)
    for (const finding of result.secrets ?? [])
      console.error(`  ${finding.path}${finding.line ? `:${finding.line}` : ''}  ${finding.kind}`)
    process.exitCode = 1
  } else if (result.status === 'nothing-to-save') console.log('nothing to save')
  else
    console.log(
      `saved ${result.commit.slice(0, 12)}${result.pushed ? ` and pushed to ${result.remote}` : ''}`,
    )
}
