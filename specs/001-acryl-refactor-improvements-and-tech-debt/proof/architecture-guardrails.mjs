#!/usr/bin/env node
/**
 * Architecture guardrails for the ACRYL technical-debt ledger.
 *
 * This is the PROOF of the major "move the logic / fix the model" tasks in
 * `specs/001-acryl-refactor-improvements-and-tech-debt/tasks.md`. Each guardrail
 * asserts one architectural invariant from `research.md` (R1–R10/R13) and the
 * `AGENTS.md` "Architecture and clean-code discipline" section.
 *
 * It is deliberately RED today: every guardrail below that is currently
 * violated reports FAIL and the script exits non-zero. Landing the matching
 * task flips it GREEN. When every guardrail reports PASS (exit 0), the move is
 * done and the ledger phase is closed.
 *
 * Usage: node specs/001-acryl-refactor-improvements-and-tech-debt/proof/architecture-guardrails.mjs
 * Run from the repository root. Read-only (no files are modified).
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '..', '..', '..')

/** Read a repo-relative file; undefined if missing. */
function read(rel) {
  const p = join(repo, rel)
  return existsSync(p) ? readFileSync(p, 'utf8') : undefined
}
/** Count occurrences of a literal (not regex) `needle` in `text`. */
const count = (text, needle) => (text ?? '').split(needle).length - 1
const has = (text, needle) => count(text, needle) > 0

const failures = []
const results = []
const check = (id, name, pass, evidence, closes) => {
  results.push({ id, name, pass, evidence, closes })
  if (!pass) failures.push(id)
}

// Which task(s) close each guardrail (see tasks.md). Printed so running the
// evidence tells the implementer exactly which test/task to land next.
const CLOSES = {
  G1: 'T013/T015',
  G2: 'T014',
  G3: 'T017',
  G4: 'T016',
  G5: 'T019',
  G6: 'T018',
  G7: 'T020',
  G8: 'T010/T012',
  G9: 'T007',
  G10: 'T003',
}

// --- G1 (R1): the auth/credential domain logic is NOT in the surface ---
const session = read('acryl-cli/src/tui-app/session.ts') ?? ''
// `beginAuthorization` deliberately excluded: it is the permanent public
// `TuiActions` entry-point name (see acryl-cli/src/tui/actions.ts) — its mere
// presence is not evidence of misplaced domain logic once it is a thin
// forwarder to `AuthorizationService.begin()`. The other four names were the
// actual duplicated join/activation/refresh function *definitions*.
const surfaceOwnsAuth = ['loadAuthorizationFlows', 'computeProviderRows', 'ensureProviderActivated', 'refreshCredentialState']
  .filter(name => has(session, name))
const controlHasAuthProjection = ['acryl-control/src/credential/', 'acryl-control/src/authorization/'].some(d => existsSync(join(repo, d)))
check('G1', 'auth/credential domain logic not in the surface',
  surfaceOwnsAuth.length === 0 && controlHasAuthProjection,
  `surface still defines: ${surfaceOwnsAuth.join(', ') || 'none'}; acryl-control projection present: ${controlHasAuthProjection}`)

// --- G2 (R2): no `-oauth` display-name encoding ---
const oauthHits = count(session, '-oauth')
check('G2', 'no `-oauth` display-name encoding',
  oauthHits === 0,
  `'-oauth' occurrences in session.ts: ${oauthHits}`)

// --- G3 (R9): zero `: any` service handles in the surface ---
const anyHits = count(session, ': any')
check('G3', 'no `: any` service handles in surface source',
  anyHits === 0,
  `': any' occurrences in session.ts: ${anyHits}`)

// --- G4 (R5): exactly one AuthMethod type, used at the seam ---
const loginTypes = read('acryl-cli/src/tui/login/types.ts') ?? ''
const mProfileTypes = read('acryl-cli/src/tui/modelProfile/types.ts') ?? ''
const actionsT = read('acryl-cli/src/tui/actions.ts') ?? ''
const authMethodDeclarations = [session, loginTypes, mProfileTypes].reduce((n, t) => n + count(t, "'oauth' | 'api-key'"), 0)
const seamTyped = !/\bmethod\?: string\b/.test(actionsT)
check('G4', 'one AuthMethod type used at the seam',
  authMethodDeclarations <= 1 && seamTyped,
  `'oauth' | 'api-key' declarations across files: ${authMethodDeclarations}; beginAuthorization still uses string: ${!seamTyped}`)

// --- G5 (R7): listWindow/visibleRange defined once, not duplicated ---
const countDef = (text, fn) => (text ?? '').split(`private ${fn}`).length - 1
const loginOv = read('acryl-cli/src/tui/login/LoginOverlay.ts') ?? ''
const modelOv = read('acryl-cli/src/tui/modelProfile/ModelProfileOverlay.ts') ?? ''
const listWindowDefs = countDef(loginOv, 'listWindow') + countDef(modelOv, 'listWindow')
const visibleRangeDefs = countDef(loginOv, 'visibleRange') + countDef(modelOv, 'visibleRange')
check('G5', 'listWindow/visibleRange defined once (not duplicated)',
  listWindowDefs <= 1 && visibleRangeDefs <= 1,
  `listWindow defs: ${listWindowDefs}; visibleRange defs: ${visibleRangeDefs}`)

// --- G6 (R6): render() does not mutate component state ---
const renderMutates = /render\([^)]*\): string\[\][\s\S]*?this\.maybeAutoSkipChooser/.test(loginOv)
check('G6', 'render() does not mutate component state',
  !renderMutates,
  `render() calls a state-mutating helper: ${renderMutates}`)

// --- G7 (R8): overlay view state is a discriminated union, not a loose cluster ---
const looseStep = /private step: 'authType' \| 'list'/.test(loginOv)
check('G7', 'overlay view state is a discriminated union',
  !looseStep,
  `LoginOverlay uses a loose step field: ${looseStep}`)

// --- G8 (R3): `configured` has one meaning across surfaces ---
const configuredDerivations = has(session, 'configured: userValue !== undefined') ? 1 : 0
const configuredRecords = has(session, 'configured: record !== undefined') ? 1 : 0
const twoConfigured = configuredDerivations + configuredRecords
check('G8', '`configured` has one meaning across surfaces',
  twoConfigured <= 1,
  `'configured' derivations: userValue=${configuredDerivations}, record=${configuredRecords}`)

// --- G9 (R10): specs/024 describes the shipped interaction ---
const spec024 = read('specs/024-acryl-cli-login/spec.md') ?? ''
const spec024DescribesTwoStep = /auth.?type|two.?step|chooser|Sign in with an account/i.test(spec024)
check('G9', 'specs/024 matches the shipped interaction',
  spec024DescribesTwoStep,
  `specs/024 mentions the two-step/chooser design: ${spec024DescribesTwoStep}`)

// --- G10 (R13): submodule pointer, upstream.json, and checkout agree ---
import { execFileSync } from 'node:child_process'
let gitlink, checkout, upstreamCommit
try {
  // Compare full SHAs, not abbreviations: `git rev-parse --short` picks a
  // variable disambiguation length (7-10+ chars), so a fixed .slice(0, 7) on
  // the other two values can mismatch even when all three agree.
  gitlink = execFileSync('git', ['ls-tree', 'HEAD', 'deepseek-harness'], { cwd: repo, encoding: 'utf8' }).split(/\s+/)[2]
  checkout = execFileSync('git', ['-C', 'deepseek-harness', 'rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim()
  const up = JSON.parse(readFileSync(join(repo, 'upstream.json'), 'utf8'))
  upstreamCommit = up.commit
} catch {
  /* submodule not initialized → guardrail FAIL with unknown values */
}
const agree = gitlink && checkout && upstreamCommit && gitlink === checkout && checkout === upstreamCommit
check('G10', 'submodule gitlink == upstream.json == checkout',
  !!agree,
  `gitlink=${gitlink}, checkout=${checkout}, upstream.json=${upstreamCommit}`)

// --- Report ---
console.log('ACRYL architecture guardrails (RED = debt still owed, GREEN = task landed)')
console.log('')
for (const r of results) {
  console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.id}  ${r.name}`)
  console.log(`        ${r.evidence}`)
  console.log(`        closes: ${CLOSES[r.id] ?? '(manual)'}   |   run: node specs/001-acryl-refactor-improvements-and-tech-debt/proof/architecture-guardrails.mjs`)
}
console.log('')
if (failures.length === 0) {
  console.log('ALL GUARDRAILS GREEN — the architectural move is done.')
  process.exit(0)
} else {
  console.log(`${failures.length}/${results.length} guardrail(s) RED — land the task listed under each FAIL above (see tasks.md).`)
  process.exit(1)
}
