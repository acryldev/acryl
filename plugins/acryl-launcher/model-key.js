// The model keys for ACRYL apps (spec 050 T010). One key per provider per machine, kept in `<home>/model.json` (owner-only), and handed to every app
// the `acryl` command starts in the variable the provider's own tools read (DEEPSEEK_API_KEY, ORCA_KEY). A key never appears in a command line, a list or a
// screen: everything here shows at most the last four characters. Home is a parameter, as in apps-registry.js.
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const MODEL_FILE = 'model.json'
export const PROVIDERS = Object.freeze(['deepseek', 'orcarouter'])

/** ACRYL's referral link at OrcaRouter: ACRYL earns a share of what a person who signs up through it spends, who pays nothing extra. */
export const ORCAROUTER_REFERRAL_URL = 'https://www.orcarouter.ai/ref/ref_2bfa348e557d434a67c1'

const PROVIDER = Object.freeze({
  deepseek: { label: 'DeepSeek', env: 'DEEPSEEK_API_KEY', problem: key => (!key.startsWith('sk-') || key.length < 20) && 'a DeepSeek key starts with sk- and is longer than this' },
  orcarouter: { label: 'OrcaRouter', env: 'ORCA_KEY', problem: key => (!key.startsWith('sk-orca-') || key.length < 20) && 'an OrcaRouter key starts with sk-orca- and is longer than this' },
})

/** Where a person gets a key: said whenever the key is missing or about to be asked for. */
const getKeyText = provider => provider === 'orcarouter'
  ? `Get an OrcaRouter key at ${ORCAROUTER_REFERRAL_URL} (a referral link: ACRYL earns a share of what you spend there, you pay nothing extra).`
  : undefined

/** Why `key` cannot be a key for `provider`, or undefined when it looks like one (a typo is caught here, not on the first failed answer). */
export function keyProblem(key, provider = 'deepseek') {
  if (key === '') return 'the key is empty'
  if (/\s/u.test(key)) return 'the key has spaces or line breaks in it: paste only the key'
  return PROVIDER[provider].problem(key) || undefined
}

function readAll(home) {
  try {
    const value = JSON.parse(readFileSync(join(home, MODEL_FILE), 'utf8'))
    return value !== null && typeof value === 'object' ? value : {}
  } catch { return {} }
}

/** The stored key, or undefined. */
export function readModelKey(home, provider = 'deepseek') {
  const value = readAll(home)[provider]
  return typeof value === 'string' && value !== '' ? value : undefined
}

function writeAll(home, keys) {
  mkdirSync(home, { recursive: true })
  const file = join(home, MODEL_FILE)
  const temporary = `${file}.${String(process.pid)}.tmp`
  writeFileSync(temporary, `${JSON.stringify(keys)}\n`, { mode: 0o600 })
  chmodSync(temporary, 0o600)
  renameSync(temporary, file)
}

/** Store the key beside the other providers' keys (owner-only file, written whole or not at all). */
export function saveModelKey(home, key, provider = 'deepseek') {
  const problem = keyProblem(key, provider)
  if (problem) throw new Error(problem)
  writeAll(home, { ...readAll(home), [provider]: key })
}

/** Forget one provider's key, or every key when no provider is named; returns whether there was one. */
export function clearModelKey(home, provider) {
  if (provider === undefined) {
    const had = PROVIDERS.some(name => readModelKey(home, name) !== undefined)
    rmSync(join(home, MODEL_FILE), { force: true })
    return had
  }
  const keys = readAll(home)
  const had = readModelKey(home, provider) !== undefined
  delete keys[provider]
  if (had) writeAll(home, keys)
  return had
}

/** `sk-...1234`: enough to tell two keys apart, never enough to use one. */
export const maskKey = key => `${key.slice(0, 3)}...${key.slice(-4)}`

/**
 * What a started app should have in its environment: each stored key, unless the environment already names one (an explicit
 * DEEPSEEK_API_KEY or ORCA_KEY wins, so a person's own export is never overridden by the stored one).
 */
export function modelEnv(home, env = {}) {
  const extra = {}
  for (const provider of PROVIDERS) {
    const name = PROVIDER[provider].env
    const key = env[name] ? undefined : readModelKey(home, provider)
    if (key) extra[name] = key
  }
  return extra
}

const USAGE = 'acryl model [set deepseek | set orcarouter | clear [deepseek | orcarouter]]'

/** `acryl model ...`. `readSecret()` asks for the key without echoing it. Returns the exit code. */
export async function runModelCommand(argv, { home, env = {}, out = () => {}, err = () => {}, readSecret }) {
  const [verb = 'status', named, ...rest] = argv
  void rest
  try {
    if (verb === 'status') {
      for (const provider of PROVIDERS) {
        const { label, env: name } = PROVIDER[provider]
        const key = readModelKey(home, provider)
        out(key ? `${label} key: set (${maskKey(key)}). Every app that acryl starts gets it.` : `${label} key: not set. Set it with: acryl model set ${provider}`)
        if (!key && getKeyText(provider)) out(getKeyText(provider))
        if (env[name]) out(`${name} is also set in this environment and wins over the stored key.`)
      }
      return 0
    }
    if (verb === 'clear') {
      if (named !== undefined && !PROVIDERS.includes(named)) { err(`acryl model clear: unknown provider "${named}". Use: ${USAGE}`); return 2 }
      const label = named === undefined ? 'model' : PROVIDER[named].label
      out(clearModelKey(home, named) ? `The stored ${label} key is removed.` : `There was no stored ${label} key.`)
      return 0
    }
    if (verb === 'set') {
      const provider = named ?? 'deepseek'
      if (!PROVIDERS.includes(provider)) { err(`acryl model set: only ${PROVIDERS.join(' and ')} are supported, not "${provider}"`); return 2 }
      const { label, env: name } = PROVIDER[provider]
      if (getKeyText(provider)) out(getKeyText(provider))
      const key = (await readSecret(`${label} API key (typing is hidden): `)).trim()
      saveModelKey(home, key, provider)
      out(`Saved (${maskKey(key)}). Every app that acryl starts now gets it as ${name}.`)
      if (provider === 'orcarouter') out('Apps do not send their model requests through OrcaRouter yet; for now the key is stored and handed to apps.')
      return 0
    }
    err(`acryl model: unknown "${verb}". Use: ${USAGE}`)
    return 2
  } catch (cause) {
    err(`acryl model: ${cause instanceof Error ? cause.message : String(cause)}`)
    return 1
  }
}
