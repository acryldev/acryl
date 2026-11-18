/**
 * Latency of a request right after a mount change (the router recomposes its Acryl) against steady state, over the built `lib/`.
 * `node scripts/bench-remount.mjs [mounts] [routesPerMount]`; prints medians and p95 in microseconds.
 */
import { Context } from '@deepseek-ai/cordis'
import { Acryl, apply, name } from '../lib/index.js'

const mounts = Number(process.argv[2] ?? 20)
const routes = Number(process.argv[3] ?? 10)
const settle = () => new Promise(resolve => setTimeout(resolve, 0))
const stats = samples => {
  const sorted = [...samples].sort((a, b) => a - b)
  const at = q => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
  return `median ${at(0.5).toFixed(1)} us, p95 ${at(0.95).toFixed(1)} us (n=${String(sorted.length)})`
}
const time = async run => {
  const start = process.hrtime.bigint()
  await run()
  return Number(process.hrtime.bigint() - start) / 1000
}

const root = new Context()
root.plugin({ name, apply })
await settle()
const appOf = mount => {
  const app = new Acryl()
  for (let route = 0; route < routes; route += 1) app.get(`/r${String(route)}/:id`, c => c.text(c.req.param('id')))
  return root.router.route(`/m${String(mount)}`, app)
}
for (let mount = 0; mount < mounts; mount += 1) appOf(mount)
const target = `/m${String(mounts - 1)}/r${String(routes - 1)}/42`
const request = async () => {
  const response = await root.router.request(target)
  if (response.status !== 200) throw new Error(`unexpected ${String(response.status)}`)
  await response.text()
}

for (let warm = 0; warm < 2000; warm += 1) await request()
const steady = []
for (let round = 0; round < 2000; round += 1) steady.push(await time(request))

const afterChange = []
for (let round = 0; round < 300; round += 1) {
  const dispose = appOf(mounts + round)
  afterChange.push(await time(request))
  dispose()
  for (let warm = 0; warm < 5; warm += 1) await request()
}

console.log(`${String(mounts)} mounts x ${String(routes)} routes`)
console.log(`steady state:          ${stats(steady)}`)
console.log(`first after a change:  ${stats(afterChange)}`)
await root.fiber.dispose()
