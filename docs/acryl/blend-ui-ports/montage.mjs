// usage: node montage.mjs <dir> <app>: old-<app>-<step>.png | new-<app>-<step>.png side by side, written as <app>-<step>-old-vs-new.png
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('/Users/musichen/_projects/p5_openWebBoxes/webboxes.ai_project/webboxesai/app/apps/e2e/package.json');
const { chromium } = require('@playwright/test');
const [DIR, APP] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'chrome' });
const page = await b.newPage({ viewport: { width: 2840, height: 960 } });
for (const f of fs.readdirSync(DIR).filter((n) => n.startsWith(`old-${APP}-`))) {
  const step = f.slice(`old-${APP}-`.length, -4);
  const img = (p) => 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
  await page.setContent(`<body style="margin:0;background:#fff;font:600 18px system-ui"><div style="display:flex;gap:40px;padding:10px"><div><div style="padding:4px 0">OLD (starter client.js, run unmodified in a host shim)</div><img src="${img(`${DIR}/old-${APP}-${step}.png`)}" style="border:1px solid #999"></div><div><div style="padding:4px 0">NEW (the page the app serves at /)</div><img src="${img(`${DIR}/new-${APP}-${step}.png`)}" style="border:1px solid #999"></div></div>`);
  await page.screenshot({ path: `${DIR}/${APP}-${step}-old-vs-new.png`, clip: { x: 0, y: 0, width: 2840, height: 960 } });
  console.log('montage', step);
}
await b.close();
