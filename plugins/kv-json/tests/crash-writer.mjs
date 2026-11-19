// A child process for the crash test: it writes two keys in turn, forever, until it is killed. After any kill the file must hold both keys
// and `a` must be the same step as `b` or one ahead of it: a write is a whole snapshot, never part of one.
import { openKv } from '../lib/open.js'

const { kv } = await openKv({ path: process.argv[2] })
const pad = 'x'.repeat(200_000)
// Continue from where the last run was killed, so the two keys never run backwards across restarts.
let step = ((await kv.get('b'))?.step ?? 0) + 1
process.send?.('ready')
for (; ; step += 1) {
  await kv.set('a', { step, pad })
  await kv.set('b', { step, pad })
}
