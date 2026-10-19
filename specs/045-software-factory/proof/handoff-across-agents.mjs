// Run from an empty folder: node --experimental-transform-types specs/045-software-factory/proof/handoff-across-agents.mjs <repo>/plugins/acryl-workspace claude,codex
// Proof: two different coding agents share one ACRYL Shared Context workspace. Agent A works and writes a handoff into the workspace brief;
// agent B, started the way ACRYL starts it, continues from that brief alone. Uses ACRYL's own SharedContext and contextLaunch, real CLIs.
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
const SRC = process.argv[2]
const [A, B] = (process.argv[3] ?? 'claude,codex').split(',')
const { SharedContext } = await import(join(SRC, 'src/shared-context/service.ts'))
const root = join(process.cwd(), 'run'); rmSync(root, { recursive: true, force: true })
const home = join(root, 'home'), api = join(root, 'shop-api'), web = join(root, 'shop-web')
for (const p of [api, web]) { mkdirSync(p, { recursive: true }); spawnSync('git', ['init', '-q'], { cwd: p }) }
writeFileSync(join(api, 'prices.js'), 'export const prices = { apple: 120, pear: 90 }\n')
writeFileSync(join(web, 'README.md'), '# shop-web\nThe storefront.\n')
const ws = { id: 'shop', name: 'Shop', kind: 'shared', projects: [api, web] }
const registry = { view: () => ({ paths: ws.projects, adopted: true, current: 'shop', workspaces: [ws] }), onChange: () => () => {} }
const shared = new SharedContext({ registry, home })
mkdirSync(shared.folder('shop'), { recursive: true })
shared.setBrief('shop', 'Goal: show prices in euros in the storefront.\n')
function run(agent, cwd, task) {
  const launch = shared.launchFor(agent, cwd)
  const env = { ...process.env, ...launch.env }
  const args = agent === 'claude' ? [...launch.args, '-p', '--permission-mode', 'acceptEdits', task]
    : agent === 'codex' ? ['exec', '--skip-git-repo-check', '--sandbox', 'workspace-write', ...launch.args, task]
    : agent === 'pi' ? [...launch.args, '-p', task] : [task]
  console.log(`\n=== ${agent} in ${cwd.split('/').pop()}\nargs: ${JSON.stringify(launch.args).slice(0, 300)}...`)
  const r = spawnSync(agent, args, { cwd, env, encoding: 'utf8', timeout: 300_000 })
  console.log('exit', r.status, '\n--- stdout (tail)\n' + (r.stdout ?? '').slice(-1500) + '\n--- stderr (tail)\n' + (r.stderr ?? '').slice(-600))
}
run(A, api, `In prices.js add a function toEuros(cents) that returns a string like "1.20 EUR". Then append a short handoff for the next agent to the workspace brief file (its path is in your workspace context): what you did, the file and function name, and the next step (the storefront in shop-web must use it). Do not do the next step. The design is approved: implement now, do not ask for confirmation.`)
console.log('\n=== BRIEF.md after A\n' + shared.brief('shop'))
run(B, web, `Continue the work in this workspace from where the previous agent left off. Say in one line what the previous agent did (file and function), then do the next step.`)
for (const f of ['shop-api/prices.js', ...['index.js', 'app.js', 'main.js', 'README.md'].map(f => 'shop-web/' + f)]) if (existsSync(join(root, f))) console.log(`\n=== ${f}\n` + readFileSync(join(root, f), 'utf8'))
spawnSync('git', ['status', '--short'], { cwd: web, stdio: 'inherit' })
