// Throwaway shell for specs/042 probe 1: Electron is only a window onto a host that runs elsewhere (Bun).
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const url = process.env.PROBE_URL
const out = process.env.PROBE_OUT
const log = []
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1280, height: 800, show: false })
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 2) log.push(`console[${level}] ${message.slice(0, 200)}`) })
  win.webContents.on('did-fail-load', (_e, code, desc) => log.push(`did-fail-load ${code} ${desc}`))
  const t0 = Date.now()
  await win.loadURL(url)
  log.push(`loaded in ${Date.now() - t0} ms, title=${JSON.stringify(win.getTitle())}`)
  await new Promise(r => setTimeout(r, 6000))
  const info = await win.webContents.executeJavaScript('({ ua: navigator.userAgent, bodyText: document.body.innerText.slice(0, 300), nodes: document.querySelectorAll("*").length })')
  log.push(JSON.stringify(info))
  const image = await win.webContents.capturePage()
  fs.writeFileSync(`${out}/window.png`, image.toPNG())
  fs.writeFileSync(`${out}/probe.log`, log.join('\n') + '\n')
  app.quit()
})
