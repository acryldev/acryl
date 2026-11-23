const { app, BrowserWindow } = require('electron')
const { spawn } = require('node:child_process')
const path = require('node:path')
const home = process.env.PROBE_HOME
app.whenReady().then(() => {
  const host = spawn(path.join(process.resourcesPath, 'host', 'acryl-bun'), [], {
    env: { ...process.env, ACRYL_HOME: path.join(home, 'acryl'), DSH_HOME: path.join(home, 'dsh'), HOME: path.join(home, 'home') },
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  let buffered = ''
  host.stdout.on('data', (chunk) => {
    buffered += chunk.toString()
    const found = /http:\/\/127\.0\.0\.1:\d+\/\?token=\S+/.exec(buffered)
    if (found && !app.win) {
      app.win = new BrowserWindow({ width: 1280, height: 800, title: 'ACRYL (frozen probe)' })
      app.win.loadURL(found[0])
    }
  })
  app.on('before-quit', () => host.kill())
})
