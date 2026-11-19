// The one thing a desktop product's window page gets from the shell: `window.acrylBlendsApp.call(op, arg)`, answered by `app-page.ts` in the main process
// (the frame's App pages: name, size, show, export, import, start over). A sandboxed preload is a CommonJS script and can only require electron; the
// channel name is `APP_PAGE_CHANNEL` in app-page.ts. It runs in the window's own page, never in the app's iframes.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('acrylBlendsApp', {
  call: (op, arg) => ipcRenderer.invoke('acrylblends:app', op, arg),
})
