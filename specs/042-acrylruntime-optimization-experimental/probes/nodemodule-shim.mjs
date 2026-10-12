// Scratch shim for E4: Bun's node:module lacks findPackageJSON and registerHooks. Loaded by e4-preload.ts.
import RealModule, { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
export { createRequire }
export const findPackageJSON = (spec, base) => {
  const s = String(spec)
  let p
  if (s.startsWith('file:')) p = fileURLToPath(s)
  else if (s.startsWith('.') || s.startsWith('/')) p = join(dirname(base ? fileURLToPath(String(base)) : process.cwd()), s)
  else { try { p = fileURLToPath(import.meta.resolve(s, base ? String(base) : undefined)) } catch { return undefined } }
  let d = dirname(p)
  for (;;) { const c = join(d, 'package.json'); if (existsSync(c)) return c; const n = dirname(d); if (n === d) return undefined; d = n }
}
export const registerHooks = (...args) => { console.error('[shim] module.registerHooks called (unsupported on Bun), args:', args.length); return { deregister() {} } }
export default RealModule
