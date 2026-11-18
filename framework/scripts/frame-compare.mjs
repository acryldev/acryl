#!/usr/bin/env node
// The comparison harness for the ACRYL frame: take screenshots of a running app at the views and viewports of `frame-views.json`, and put them beside a reference set with a diff.
//
//   node scripts/frame-compare.mjs capture <url> <out folder> [--views a,b] [--views-file <json>]
//   node scripts/frame-compare.mjs compare <reference folder> <candidate folder> <out folder> [--max <percent>] [--views a,b]
//   node scripts/frame-compare.mjs check   <reference folder> <url> <out folder> [--max <percent>] [--views a,b]   (capture, then compare)
//   node scripts/frame-compare.mjs check   --against acryl <url> <out folder> [--views a,b]                        (the ACRYL design target: report only)
//   node scripts/frame-compare.mjs compare --against acryl <candidate folder> <out folder> [--views a,b]            (same, against a captured set)
//
// `compare` writes <view>@<w>x<h>.compare.png (reference | candidate | difference, red where a pixel differs by more than a small tolerance) and `report.md`; it exits 1 when a view
// differs by more than --max percent (default 2) or a reference view has no candidate. `--views` limits both the capture and the comparison. `--against acryl` uses
// scripts/frame-reference and never fails: that set is ACRYL Desktop with no project and ACRYL's own plugin set, so a frame with an app open differs in content by design, and the
// report is a design-target reading rather than a gate. Only headless Chrome is used (also for the diff), so there is nothing to install.
import { spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromeFlags, devtools, findChrome } from './lib/door-probe.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
const flag = (name) =>
  process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined
const positional = process.argv
  .slice(3)
  .filter(
    (arg, index, all) => !arg.startsWith('--') && !(index > 0 && all[index - 1].startsWith('--')),
  )
/** The design target set: ACRYL Desktop's own views. Its composition (no project, ACRYL's plugins) differs from a frame running an app, so it reports, never gates. */
const against = flag('--against')
if (against !== undefined && against !== 'acryl') {
  console.error(`frame-compare: unknown reference set "${against}" (only "acryl" is built in)`)
  process.exit(2)
}
const acrylReference = join(here, 'frame-reference')
const reportOnly = against !== undefined || process.argv.includes('--report-only')

async function withChrome(work) {
  const chrome = findChrome()
  if (!chrome)
    throw new Error('frame-compare: no Chrome or Chromium on this machine (set CHROME_BIN)')
  const port = 9300 + Math.floor(Math.random() * 500)
  // `--disable-notifications`: a browser whose notification permission is still `default` puts "Enable notifications" in the
  // workspace status line, which adds a 24px bar and shifts the centred conversation up by half of it. The ACRYL desktop has no
  // such prompt (the window owns notifications), so the reference set does not have it; the flag makes the two surfaces
  // comparable. It is not a product change: a person's browser still asks.
  const child = spawn(
    chrome,
    [
      ...chromeFlags(mkdtempSync(join(tmpdir(), 'frame-compare-')), port),
      '--hide-scrollbars',
      '--disable-notifications',
    ],
    { stdio: 'ignore' },
  )
  try {
    for (let i = 0; i < 200; i += 1) {
      if (
        await fetch(`http://127.0.0.1:${port}/json/version`).then(
          (r) => r.ok,
          () => false,
        )
      )
        break
      await sleep(50)
    }
    const cdp = await devtools(port)
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    try {
      return await work(cdp)
    } finally {
      cdp.close()
    }
  } finally {
    child.kill('SIGKILL')
  }
}

const evaluate = async (cdp, expression) =>
  (await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }))
    .result?.result?.value

async function runSteps(cdp, steps) {
  for (const step of steps) {
    const target = step.click ?? step.clickIfPresent
    if (target !== undefined) {
      const clicked = await evaluate(
        cdp,
        `(() => { const want = ${JSON.stringify(target)}; const el = [...document.querySelectorAll('button,a,[role=button],[role=link],[role=tab],[role=menuitem],[role=treeitem]')].find((e) => e.textContent.trim() === want || e.getAttribute('aria-label') === want || e.getAttribute('title') === want); if (!el) return false; el.click(); return true })()`,
      )
      if (!clicked && step.click !== undefined) throw new Error(`no control named "${step.click}"`)
    } else if (step.wait !== undefined) await sleep(step.wait)
    else if (step.eval !== undefined) await evaluate(cdp, step.eval)
    else if (step.key !== undefined) {
      const modifiers = { Alt: 1, Control: 2, Meta: 4, Shift: 8 }
      const parts = step.key.split('+')
      const key = parts.pop()
      const bits = parts.reduce((n, part) => n | (modifiers[part] ?? 0), 0)
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, modifiers: bits })
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, modifiers: bits })
    }
    await sleep(120)
  }
}

async function capture(url, out) {
  const file = flag('--views-file') ?? join(here, 'frame-views.json')
  const spec = JSON.parse(readFileSync(file, 'utf8'))
  const only = flag('--views')?.split(',')
  mkdirSync(out, { recursive: true })
  const taken = []
  await withChrome(async (cdp) => {
    const origin = new URL(url).origin
    // The first load carries the token the host asks for (a cookie it sets); the views then use plain paths.
    await cdp.send('Page.navigate', { url })
    await sleep(2500)
    for (const view of spec.views.filter((v) => only === undefined || only.includes(v.name))) {
      for (const viewport of spec.viewports) {
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width: viewport.width,
          height: viewport.height,
          deviceScaleFactor: 1,
          mobile: false,
        })
        await cdp.send('Emulation.setEmulatedMedia', {
          features: [{ name: 'prefers-color-scheme', value: view.theme ?? 'dark' }],
        })
        await evaluate(cdp, `try { localStorage.clear(); sessionStorage.clear() } catch {}`)
        await cdp.send('Page.navigate', { url: `${origin}${view.path}` })
        await sleep(2200)
        const name = `${view.name}@${viewport.width}x${viewport.height}`
        try {
          await runSteps(cdp, view.steps ?? [])
          await sleep(300)
          writeFileSync(
            join(out, `${name}.png`),
            Buffer.from(
              (await cdp.send('Page.captureScreenshot', { format: 'png' })).result.data,
              'base64',
            ),
          )
          taken.push(name)
        } catch (cause) {
          console.error(`frame-compare: ${name}: ${cause.message}`)
        }
      }
    }
  })
  console.log(`captured ${taken.length} views in ${out}`)
  return taken
}

/** The page that draws a reference and a candidate side by side with their difference, and counts the pixels that differ. */
const comparePage = (
  reference,
  candidate,
  mask,
  tolerance,
) => `<!doctype html><body style="margin:0;background:#222"><canvas id=c></canvas><script>
const load = (src) => new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = src })
window.result = (async () => {
  const [a, b] = await Promise.all([load(${JSON.stringify(reference)}), load(${JSON.stringify(candidate)})])
  const w = Math.max(a.width, b.width), h = Math.max(a.height, b.height)
  const draw = (img) => { const c = new OffscreenCanvas(w, h), x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h) }
  // The reference keeps its own alpha: a transparent pixel has no colour to compare (ACRYL's Desktop page is transparent over the native window material), so the
  // black it would be drawn over is an invention, not a difference. Those pixels are skipped like masked ones.
  const bare = (img) => { const c = new OffscreenCanvas(w, h), x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h) }
  const A = draw(a), B = draw(b), D = new ImageData(w, h), R = bare(a)
  const masks = ${JSON.stringify(mask)}
  const masked = (x, y) => masks.some((m) => x >= m.x && x < m.x + m.width && y >= m.y && y < m.y + m.height)
  let differing = 0, counted = 0
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4
    const gray = (A.data[i] + A.data[i + 1] + A.data[i + 2]) / 3
    if (masked(x, y) || R.data[i + 3] < 8) { D.data.set([60, 60, 120, 255], i); continue }
    counted++
    const off = Math.abs(A.data[i] - B.data[i]) > ${tolerance} || Math.abs(A.data[i + 1] - B.data[i + 1]) > ${tolerance} || Math.abs(A.data[i + 2] - B.data[i + 2]) > ${tolerance}
    if (off) { differing++; D.data.set([255, 40, 40, 255], i) } else D.data.set([gray, gray, gray, 255], i)
  }
  const c = document.getElementById('c'); c.width = w * 3 + 20; c.height = h
  const x = c.getContext('2d'); x.fillStyle = '#222'; x.fillRect(0, 0, c.width, c.height)
  x.drawImage(a, 0, 0); x.drawImage(b, w + 10, 0)
  const t = document.createElement('canvas'); t.width = w; t.height = h; t.getContext('2d').putImageData(D, 0, 0); x.drawImage(t, 2 * w + 20, 0)
  return { width: w, height: h, sizes: [a.width + 'x' + a.height, b.width + 'x' + b.height], percent: counted === 0 ? 0 : (100 * differing) / counted }
})()
</script></body>`

async function compare(referenceDir, candidateDir, out) {
  mkdirSync(out, { recursive: true })
  const max = Number(flag('--max') ?? 2)
  const spec = JSON.parse(
    readFileSync(flag('--views-file') ?? join(here, 'frame-views.json'), 'utf8'),
  )
  const masks = new Map(spec.views.map((view) => [view.name, view.mask ?? []]))
  // `--views` limits the comparison the same way it limits the capture: a caller that needs three views should not be told the rest are missing.
  const only = flag('--views')?.split(',')
  const names = readdirSync(referenceDir)
    .filter((name) => name.endsWith('.png') && !name.endsWith('.compare.png'))
    .filter((name) => only === undefined || only.includes(name.split('@')[0]))
    .sort()
  const rows = []
  await withChrome(async (cdp) => {
    for (const file of names) {
      const base = file.replace(/\.png$/u, '')
      const candidate = join(candidateDir, file)
      if (!existsSync(candidate)) {
        rows.push({ base, missing: true })
        continue
      }
      const asUrl = (path) => `data:image/png;base64,${readFileSync(path).toString('base64')}`
      const html = comparePage(
        asUrl(join(referenceDir, file)),
        asUrl(candidate),
        masks.get(base.split('@')[0]) ?? [],
        12,
      )
      writeFileSync(join(out, '.page.html'), html)
      await cdp.send('Page.navigate', { url: `file://${resolve(out, '.page.html')}` })
      let result
      for (let i = 0; i < 100 && result === undefined; i += 1) {
        result = await evaluate(
          cdp,
          'window.result ? window.result.then((r) => r) : undefined',
        ).catch(() => undefined)
        if (result === undefined) await sleep(100)
      }
      const size = await evaluate(
        cdp,
        '({ w: document.getElementById("c").width, h: document.getElementById("c").height })',
      )
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: size.w,
        height: size.h,
        deviceScaleFactor: 1,
        mobile: false,
      })
      writeFileSync(
        join(out, `${base}.compare.png`),
        Buffer.from(
          (
            await cdp.send('Page.captureScreenshot', {
              format: 'png',
              clip: { x: 0, y: 0, width: size.w, height: size.h, scale: 1 },
            })
          ).result.data,
          'base64',
        ),
      )
      rows.push({ base, ...result })
    }
  })
  const lines = [
    '# Frame comparison',
    '',
    `Reference: ${referenceDir}. Candidate: ${candidateDir}. A view passes when at most ${max}% of its pixels differ (per-channel tolerance 12).`,
    '',
    '| View | Sizes (reference, candidate) | Differing | Result | Side by side |',
    '| --- | --- | --- | --- | --- |',
  ]
  let failed = 0
  for (const row of rows) {
    if (row.missing) {
      failed += 1
      lines.push(`| ${row.base} | | | MISSING candidate | |`)
    } else {
      const ok = row.percent <= max && row.sizes[0] === row.sizes[1]
      if (!ok) failed += 1
      lines.push(
        `| ${row.base} | ${row.sizes.join(', ')} | ${row.percent.toFixed(2)}% | ${ok ? 'pass' : row.sizes[0] === row.sizes[1] ? 'FAIL' : 'FAIL (sizes differ)'} | ${row.base}.compare.png |`,
      )
    }
  }
  writeFileSync(join(out, 'report.md'), `${lines.join('\n')}\n`)
  console.log(lines.slice(4).join('\n'))
  console.log(
    `${rows.length - failed} of ${rows.length} views within ${max}%${reportOnly ? ' (report only)' : ''}; report in ${join(out, 'report.md')}`,
  )
  if (failed > 0 && !reportOnly) process.exitCode = 1
}

const mode = process.argv[2]
/** The reference folder: the built-in ACRYL set under `--against acryl`, otherwise the first positional argument. */
const reference = against === undefined ? positional[0] : acrylReference
const rest = against === undefined ? positional.slice(1) : positional
const enough = against === undefined ? positional.length >= 3 : positional.length >= 2
if (mode === 'capture' && positional.length >= 2) await capture(positional[0], positional[1])
else if (mode === 'compare' && enough) await compare(reference, rest[0], rest[1])
else if (mode === 'check' && enough) {
  await capture(rest[0], join(rest[1], 'candidate'))
  await compare(reference, join(rest[1], 'candidate'), join(rest[1], 'compare'))
} else {
  console.error(
    'usage: frame-compare.mjs capture <url> <out> | compare <reference> <candidate> <out> | check <reference> <url> <out> [--views a,b] [--max percent] | check --against acryl <url> <out>',
  )
  process.exit(2)
}
