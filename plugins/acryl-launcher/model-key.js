// The model key for ACRYL apps (spec 050 T010). One DeepSeek key per machine, kept in `<home>/model.json` (owner-only), and handed to every app
// the `acryl` command starts as DEEPSEEK_API_KEY, the variable the apps read. The key never appears in a command line, a list or a screen:
// everything here shows at most the last four characters. Home is a parameter, as in apps-registry.js.
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const MODEL_FILE = 'model.json'
export const PROVIDERS = Object.freeze(['deepseek'])
const ENV_NAME = Object.freeze({ deepseek: 'DEEPSEEK_API_KEY' })

/** Why `key` cannot be a DeepSeek key, or undefined when it looks like one (a typo is caught here, not on the first failed answer). */
export function keyProblem(key) {
  if (key === '') return 'the key is empty'
  if (/\s/u.test(key)) return 'the key has spaces or line breaks in it: paste only the key'
  if (!key.startsWith('sk-') || key.length < 20) return 'a DeepSeek key starts with sk- and is longer than this'
  return undefined
}

/** The stored key, or undefined. */
export function readModelKey(home, provider = 'deepseek') {
  try {
    const value = JSON.parse(readFileSync(join(home, MODEL_FILE), 'utf8'))?.[provider]
    return typeof value === 'string' && value !== '' ? value : undefined
  } catch { return undefined }
}

/** Store the key (owner-only file, written whole or not at all). */
export function saveModelKey(home, key, provider = 'deepseek') {
  const problem = keyProblem(key)
  if (problem) throw new Error(problem)
  mkdirSync(home, { recursive: true })
  const file = join(home, MODEL_FILE)
  const temporary = `${file}.${String(process.pid)}.tmp`
  writeFileSync(temporary, `${JSON.stringify({ [provider]: key })}\n`, { mode: 0o600 })
  chmodSync(temporary, 0o600)
  renameSync(temporary, file)
}

/** Forget the key; returns whether there was one. */
export function clearModelKey(home) {
  const had = readModelKey(home) !== undefined
  rmSync(join(home, MODEL_FILE), { force: true })
  return had
}

/** `sk-...1234`: enough to tell two keys apart, never enough to use one. */
export const maskKey = key => `${key.slice(0, 3)}...${key.slice(-4)}`

/**
 * What a started app should have in its environment: the stored key, unless the environment already names one (an explicit
 * DEEPSEEK_API_KEY wins, so a person's own export is never overridden by the stored one).
 */
export function modelEnv(home, env = {}) {
  const extra = {}
  for (const provider of PROVIDERS) {
    const name = ENV_NAME[provider]
    const key = env[name] ? undefined : readModelKey(home, provider)
    if (key) extra[name] = key
  }
  return extra
}

/** `acryl model [set deepseek | clear]`. `readSecret()` asks for the key without echoing it. Returns the exit code. */
export async function runModelCommand(argv, { home, env = {}, out = () => {}, err = () => {}, readSecret }) {
  const [verb = 'status', provider = 'deepseek', ...rest] = argv
  try {
    if (verb === 'status') {
      const key = readModelKey(home)
      out(key ? `DeepSeek key: set (${maskKey(key)}). Every app that acryl starts gets it.` : 'DeepSeek key: not set. Set it with: acryl model set deepseek')
      if (env.DEEPSEEK_API_KEY) out('DEEPSEEK_API_KEY is also set in this environment and wins over the stored key.')
      return 0
    }
    if (verb === 'clear') {
      out(clearModelKey(home) ? 'The stored DeepSeek key is removed.' : 'There was no stored DeepSeek key.')
      return 0
    }
    if (verb === 'set') {
      if (!PROVIDERS.includes(provider)) { err(`acryl model set: only deepseek is supported, not "${provider}"`); return 2 }
      void rest
      const key = (await readSecret('DeepSeek API key (typing is hidden): ')).trim()
      saveModelKey(home, key)
      out(`Saved (${maskKey(key)}). Every app that acryl starts now gets it as DEEPSEEK_API_KEY.`)
      return 0
    }
    err(`acryl model: unknown "${verb}". Use: acryl model [set deepseek | clear]`)
    return 2
  } catch (cause) {
    err(`acryl model: ${cause instanceof Error ? cause.message : String(cause)}`)
    return 1
  }
}
