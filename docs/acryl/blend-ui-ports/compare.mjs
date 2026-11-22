// usage: node compare.mjs <app> <port> <outdir> [width height]
// OLD: the starter's old client.js, unmodified, in a minimal host shim (the module loader, acryl-app-shell and the slot it registers into; the conversation is a placeholder),
//      with its /api/acryl-<app>/ calls sent to the app's routes. NEW: the page the app serves at /.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('/Users/musichen/_projects/p5_openWebBoxes/webboxes.ai_project/webboxesai/app/apps/e2e/package.json');
const { chromium } = require('@playwright/test');
const [APP, PORT, OUT, W = '1400', H = '900'] = process.argv.slice(2);
const OLD = { music: ['/tmp/cmp/music/package/plugins/acryl-music/client.js', 'music'], orderdesk: ['/tmp/cmp/orderdesk/package/plugins/acryl-orderdesk/client.js', 'orderdesk'], accounting: ['/tmp/cmp/acc/package/plugins/acryl-accounting/client.js', 'accounting'], gtd: ['/tmp/cmp/gtd/package/plugins/acryl-gtd/client.js', 'gtd'], organizer: ['/tmp/cmp/o/package/plugins/acryl-organizer/client.js', 'organizer'] }[APP];
const origin = `http://127.0.0.1:${PORT}`;
const appDir = process.env.APP_DIR;
const react = fs.readFileSync(`${appDir}/node_modules/react/umd/react.production.min.js`, 'utf8');
const reactDom = fs.readFileSync(`${appDir}/node_modules/react-dom/umd/react-dom.production.min.js`, 'utf8');
const oldClient = fs.readFileSync(OLD[0], 'utf8');
const shim = `
window.__ModuleLoader__ = { load({ factory }) {
  const exports = factory((name) => {
    if (name === 'react') return window.React;
    if (name === 'acryl-app-shell/client') return { resolveShellEnvironment: () => ({ mode: 'advanced' }), applyAdvancedShell() {} };
    throw new Error('unknown module ' + name);
  });
  window.__old = exports;
} };`;
const mount = `
let Comp; window.__old.apply({ slots: { inject: (_slot, fn) => fn(), register: (_o, c) => { Comp = c; } } });
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Comp, { renderConversation: () => React.createElement('div', { style: { padding: 16, color: '#888', font: '14px system-ui' } }, 'Agent conversation (the host\\'s chat panel)') }));`;
const html = `<!doctype html><meta charset="utf-8"><style>html,body,#root{margin:0;height:100%}</style><div id="root"></div><script>${react}</script><script>${reactDom}</script><script>${shim}</script><script>${oldClient}</script><script>${mount}</script>`;
const STEPS = {
  music: [['start', async () => {}], ['techno', async (p) => { await p.locator('button', { hasText: 'techno' }).click(); await p.waitForTimeout(800) }], ['eight-steps', async (p) => { await p.locator('button', { hasText: '8 steps' }).click(); await p.waitForTimeout(800) }]],
  orderdesk: [['start', async () => {}], ['sample', async (p) => { const b = p.locator('button', { hasText: /sample/i }); if (await b.count()) { await b.first().click(); await p.waitForTimeout(1200) } }], ['stock', async (p) => { await p.locator('button, [role=tab]', { hasText: /^Stock/ }).first().click(); await p.waitForTimeout(600) }], ['outbox-rules', async (p) => { await p.locator('button, [role=tab]', { hasText: /Outbox/ }).first().click(); await p.waitForTimeout(600) }], ['pipeline', async (p) => { await p.locator('button, [role=tab]', { hasText: /^Pipeline/ }).first().click(); await p.waitForTimeout(600) }], ['order-ready', async (p, kind) => { if (kind === 'old') await fetch(origin + '/orderdesk/order', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ emailId: 1, lines: 'ESP-1K x6, FIL-1K x2' }) }); await p.waitForTimeout(3000) }], ['shipped-note', async (p, kind) => { if (kind === 'old') await fetch(origin + '/orderdesk/order-ship', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 5 }) }); await p.waitForTimeout(3000); const n = p.locator('button, a', { hasText: /delivery note|note/i }); if (await n.count()) { await n.first().click(); await p.waitForTimeout(900) } }]],
  accounting: [['invoices', async () => {}], ['expenses', async (p) => { await p.locator('[role=tab]', { hasText: 'Expenses' }).click(); await p.waitForTimeout(500) }], ['summary', async (p) => { await p.locator('[role=tab]', { hasText: /VAT/ }).click(); await p.waitForTimeout(900) }]],
  gtd: [['board', async () => {}], ['list', async (p) => { const t = p.locator('[role=tab]'); if (await t.count() > 1) { await t.nth(1).click(); await p.waitForTimeout(500) } }], ['calendar', async (p) => { const t = p.locator('[role=tab]'); if (await t.count() > 2) { await t.nth(2).click(); await p.waitForTimeout(500) } }], ['projects', async (p) => { const t = p.locator('[role=tab]'); if (await t.count() > 3) { await t.nth(3).click(); await p.waitForTimeout(500) } }]],
  organizer: [['today', async () => {}], ['todo', async (p) => { const i = p.locator('input[type=text], input:not([type])').first(); if (await i.count()) { await i.fill('Walk the dog'); await i.press('Enter'); await p.waitForTimeout(1500) } }]],
}[APP];
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ channel: 'chrome' });
async function pageFor(kind) {
  const ctx = await b.newContext({ viewport: { width: Number(W), height: Number(H) }, timezoneId: 'UTC' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
  if (kind === 'old') {
    await page.route(`${origin}/api/acryl-${OLD[1]}/**`, (route) => route.continue({ url: route.request().url().replace(`/api/acryl-${OLD[1]}/`, `/${OLD[1]}/`) }));
    await page.route(`${origin}/__old`, (route) => route.fulfill({ contentType: 'text/html', body: html }));
    await page.goto(`${origin}/__old`, { waitUntil: 'networkidle' });
  } else await page.goto(`${origin}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  return { page, errs };
}
const old = await pageFor('old'); const neu = await pageFor('new');
for (const [name, step] of STEPS) {
  await step(old.page, 'old'); await step(neu.page, 'new');
  await old.page.waitForTimeout(500);
  await old.page.screenshot({ path: `${OUT}/old-${APP}-${name}.png` });
  await neu.page.screenshot({ path: `${OUT}/new-${APP}-${name}.png` });
  console.log(name, 'text same (minus the conversation placeholder):', (await old.page.locator('body').innerText()).replace(/Agent conversation \(the host's chat panel\)/, '').replace(/\s+/g, ' ').trim() === (await neu.page.locator('body').innerText()).replace(/\s+/g, ' ').trim());
}
console.log('page errors old/new:', JSON.stringify(old.errs), JSON.stringify(neu.errs));
await b.close();
