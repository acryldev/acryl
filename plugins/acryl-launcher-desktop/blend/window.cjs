/**
 * The window `pnpm launcher blend` opens on the launcher's Blends app (spec 050 T016): the frame's page with its left panel (branches, versions) hidden and its
 * right panel (chat, Claude Code, Codex, Pi) open. The page's title never replaces ACRYL.
 */
const { app, BrowserWindow, shell } = require('electron')
const url = process.env.LAUNCHER_URL
app.setName('ACRYL')
const LEFT = 'button[aria-label="Left panel: branches and versions"]'
const RIGHT = 'button[aria-label="Right panel: agents"]'
const CSS = LEFT + '{display:none!important}'
const TIDY = `(() => {
  const visible = (re, sel) => [...document.querySelectorAll(sel)].some(e => re.test(e.textContent.trim()) && e.offsetParent !== null)
  const left = document.querySelector(${JSON.stringify(LEFT)})
  if (left && visible(/^branches$/i, 'div,span,h2,h3,p')) left.click()
  const right = document.querySelector(${JSON.stringify(RIGHT)})
  if (right && !window.__rightTried && !visible(/History/, 'button')) { window.__rightTried = true; right.click() }
})()`
// One window per launcher app (the lock is per user-data folder): a second start only brings this window forward.
if (!app.requestSingleInstanceLock()) app.exit(0)
let w
app.on('second-instance', () => { if (w) { if (w.isMinimized()) w.restore(); w.show(); w.focus(); app.focus({ steal: true }) } })
// A stop signal closes the window like the close button does; if the page hangs, the process still ends.
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, () => { app.quit(); setTimeout(() => app.exit(0), 3000).unref() })
app.whenReady().then(() => {
  if (!url) return
  if (process.env.LAUNCHER_ICON && app.dock) app.dock.setIcon(process.env.LAUNCHER_ICON)
  w = new BrowserWindow({ width: 1500, height: 940, title: 'ACRYL', backgroundColor: '#141416', icon: process.env.LAUNCHER_ICON })
  w.webContents.setWindowOpenHandler(({ url: u }) => { shell.openExternal(u); return { action: 'deny' } })
  w.on('page-title-updated', e => e.preventDefault())
  w.webContents.on('did-finish-load', () => { w.webContents.insertCSS(CSS).catch(() => {}) })
  setInterval(() => { w.webContents.executeJavaScript(TIDY).catch(() => {}) }, 700)
  w.loadURL(url)
})
app.on('window-all-closed', () => app.quit())
