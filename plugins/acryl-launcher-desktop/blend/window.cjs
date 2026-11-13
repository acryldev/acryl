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
app.whenReady().then(() => {
  const w = new BrowserWindow({ width: 1500, height: 940, title: 'ACRYL', backgroundColor: '#141416' })
  w.webContents.setWindowOpenHandler(({ url: u }) => { shell.openExternal(u); return { action: 'deny' } })
  w.on('page-title-updated', e => e.preventDefault())
  w.webContents.on('did-finish-load', () => { w.webContents.insertCSS(CSS).catch(() => {}) })
  setInterval(() => { w.webContents.executeJavaScript(TIDY).catch(() => {}) }, 700)
  w.loadURL(url)
})
app.on('window-all-closed', () => app.quit())
