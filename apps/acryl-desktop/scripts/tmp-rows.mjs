import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepareDesktopProfile } from '../lib/profile.js'
const home = mkdtempSync(join(tmpdir(), 'dsh-rows-'))
try {
  const prepared = prepareDesktopProfile('1', home, process.platform)
  console.log('prepared keys:', Object.keys(prepared).join(', '))
  console.log('rootConfig:', JSON.stringify(prepared.rootConfig).slice(0, 600))
  console.log('patch count:', prepared.patches.length)
  for (const patch of prepared.patches) {
    const text = JSON.stringify(patch)
    if (/webserver|connection|web-runtime/i.test(text)) console.log('PATCH', text.slice(0, 220))
  }
} finally {
  rmSync(home, { recursive: true, force: true })
}
