import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { ORCAROUTER_REFERRAL_URL, clearModelKey, keyProblem, maskKey, modelEnv, readModelKey, runModelCommand, saveModelKey } from '../index.js'

const KEY = 'sk-0123456789abcdef0123456789abcdef'
const scratch = run => {
  const home = mkdtempSync(join(tmpdir(), 'acryl-model-'))
  return Promise.resolve(run(home)).finally(() => rmSync(home, { recursive: true, force: true }))
}

test('only something that looks like a DeepSeek key is stored, and the file is owner-only', () => scratch(home => {
  for (const bad of ['', 'sk-short', 'not-a-key-at-all-not-a-key', `${KEY} extra`, `${KEY}\nmore`]) assert.throws(() => saveModelKey(home, bad), undefined, bad)
  assert.equal(readModelKey(home), undefined)
  saveModelKey(home, KEY)
  assert.equal(readModelKey(home), KEY)
  if (process.platform !== 'win32') assert.equal(statSync(join(home, 'model.json')).mode & 0o777, 0o600)
  assert.equal(keyProblem(KEY), undefined)
  assert.equal(maskKey(KEY), 'sk-...cdef')
  assert.equal(clearModelKey(home), true)
  assert.equal(clearModelKey(home), false)
}))

test('an app gets the stored key, unless the environment already has one', () => scratch(home => {
  assert.deepEqual(modelEnv(home, {}), {})
  saveModelKey(home, KEY)
  assert.deepEqual(modelEnv(home, {}), { DEEPSEEK_API_KEY: KEY })
  assert.deepEqual(modelEnv(home, { DEEPSEEK_API_KEY: 'sk-own-own-own-own-own-own' }), {})
}))

test('acryl model: status never shows the key, set asks for it and stores it, clear forgets it', () => scratch(async home => {
  const out = []
  const err = []
  const run = (argv, secret = () => { throw new Error('must not ask') }, env = {}) => runModelCommand(argv, { home, env, out: line => out.push(line), err: line => err.push(line), readSecret: async () => secret() })
  assert.equal(await run([]), 0)
  assert.match(out.splice(0).join('\n'), /DeepSeek key: not set\. Set it with: acryl model set deepseek/u)
  assert.equal(await run(['set', 'deepseek'], () => `  ${KEY}\n`), 0)
  assert.match(out.pop(), /Saved \(sk-\.\.\.cdef\)/u)
  assert.equal(await run(['status'], undefined, { DEEPSEEK_API_KEY: 'x' }), 0)
  const shown = out.splice(0).join('\n')
  assert.match(shown, /set \(sk-\.\.\.cdef\)/u)
  assert.match(shown, /wins over the stored key/u)
  assert.equal(shown.includes(KEY), false, 'the key is never printed')
  assert.equal(await run(['set', 'deepseek'], () => 'oops'), 1)
  assert.match(err.pop(), /starts with sk-/u)
  assert.equal(readModelKey(home), KEY, 'a refused key leaves the stored one alone')
  assert.equal(await run(['set', 'openai']), 2)
  assert.equal(await run(['clear']), 0)
  assert.equal(readModelKey(home), undefined)
  assert.equal(await run(['what']), 2)
}))

test('OrcaRouter: its own key check and variable, the referral link where a key is asked for, and it never replaces the DeepSeek key', () => scratch(async home => {
  const ORCA = 'sk-orca-0123456789abcdef0123456789'
  assert.equal(keyProblem(KEY, 'orcarouter') !== undefined, true, 'a DeepSeek key is not an OrcaRouter key')
  assert.equal(keyProblem(ORCA, 'orcarouter'), undefined)
  saveModelKey(home, KEY)
  saveModelKey(home, ORCA, 'orcarouter')
  assert.equal(readModelKey(home), KEY, 'saving one provider keeps the other')
  assert.equal(readModelKey(home, 'orcarouter'), ORCA)
  assert.deepEqual(modelEnv(home, {}), { DEEPSEEK_API_KEY: KEY, ORCA_KEY: ORCA })
  assert.deepEqual(modelEnv(home, { ORCA_KEY: 'own' }), { DEEPSEEK_API_KEY: KEY })
  assert.equal(clearModelKey(home, 'orcarouter'), true)
  assert.equal(readModelKey(home), KEY, 'clearing one provider keeps the other')
  assert.equal(readModelKey(home, 'orcarouter'), undefined)

  const out = []
  const err = []
  const run = (argv, secret) => runModelCommand(argv, { home, env: {}, out: line => out.push(line), err: line => err.push(line), readSecret: async () => secret })
  assert.equal(await run(['status']), 0)
  assert.equal(out.splice(0).join('\n').includes(ORCAROUTER_REFERRAL_URL), true, 'status says where to get a missing key')
  assert.equal(await run(['set', 'orcarouter'], ORCA), 0)
  const said = out.splice(0).join('\n')
  assert.equal(said.includes(ORCAROUTER_REFERRAL_URL), true)
  assert.match(said, /referral link/u)
  assert.match(said, /as ORCA_KEY/u)
  assert.match(said, /do not send their model requests through OrcaRouter yet/u)
  assert.equal(said.includes(ORCA), false, 'the key is never printed')
  assert.equal(await run(['set', 'orcarouter'], KEY), 1)
  assert.equal(readModelKey(home, 'orcarouter'), ORCA, 'a refused key leaves the stored one alone')
  assert.equal(await run(['clear', 'nobody']), 2)
  assert.equal(await run(['clear', 'orcarouter']), 0)
  assert.equal(readModelKey(home), KEY)
}))
