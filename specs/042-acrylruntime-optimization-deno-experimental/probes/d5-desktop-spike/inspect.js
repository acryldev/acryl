(() => {
  const c = document.createElement('canvas')
  const has = (n) => { try { return !!n() } catch { return false } }
  const features = {
    webgl2: has(() => c.getContext('webgl2')), webgl1: has(() => document.createElement('canvas').getContext('webgl')),
    offscreenCanvas: typeof OffscreenCanvas !== 'undefined', resizeObserver: typeof ResizeObserver !== 'undefined', intersectionObserver: typeof IntersectionObserver !== 'undefined',
    structuredClone: typeof structuredClone === 'function', clipboardApi: has(() => navigator.clipboard && navigator.clipboard.writeText), serviceWorker: 'serviceWorker' in navigator,
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined', crossOriginIsolated: self.crossOriginIsolated === true, requestIdleCallback: typeof requestIdleCallback === 'function',
    intlSegmenter: typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function', objectGroupBy: typeof Object.groupBy === 'function', promiseWithResolvers: typeof Promise.withResolvers === 'function',
    cssOklch: CSS.supports('color', 'oklch(0.7 0.1 200)'), cssHas: CSS.supports('selector(:has(a))'), cssContainer: CSS.supports('container-type', 'inline-size'), cssBackdrop: CSS.supports('backdrop-filter', 'blur(2px)'),
    cssNesting: CSS.supports('selector(&)'), cssSubgrid: CSS.supports('grid-template-columns', 'subgrid'), dragDrop: 'ondrop' in window && typeof DataTransfer !== 'undefined',
    localStorage: has(() => { localStorage.setItem('k', '1'); return localStorage.getItem('k') === '1' }), indexedDB: typeof indexedDB !== 'undefined', webSocket: typeof WebSocket !== 'undefined', webWorker: typeof Worker !== 'undefined',
    showDirectoryPicker: typeof showDirectoryPicker === 'function', fileSystemAccess: typeof window.showOpenFilePicker === 'function', notifications: typeof Notification !== 'undefined',
  }
  const missing = Object.entries(features).filter(([, v]) => !v).map(([k]) => k)
  const res = performance.getEntriesByType('resource')
  const failed = res.filter((r) => r.responseStatus >= 400).map((r) => `${r.responseStatus} ${new URL(r.name).pathname}`).slice(0, 10)
  return JSON.stringify({ ua: navigator.userAgent.slice(-60), dpr: devicePixelRatio, fontsLoaded: document.fonts.size, resources: res.length, failedResources: failed, missingFeatures: missing })
})()
//----
(() => { const b = [...document.querySelectorAll('button,[role=button],[role=tab]')].find((e) => /^Continue$/.test(((e.getAttribute('aria-label')||'')+' '+(e.textContent||'')).replace(/\\s+/g,' ').trim())); if (b) b.click(); return JSON.stringify({ dismissedNotice: Boolean(b) }) })()
//----
(() => { const b = [...document.querySelectorAll('button,[role=button],[role=tab]')].find((e) => /^Configure later$/.test(((e.getAttribute('aria-label')||'')+' '+(e.textContent||'')).replace(/\\s+/g,' ').trim())); if (b) b.click(); return JSON.stringify({ dismissedApiKeyPrompt: Boolean(b) }) })()
//----
(() => { const b = [...document.querySelectorAll('button,[role=button],[role=tab]')].find((e) => /New tab: Terminal/.test(((e.getAttribute('aria-label')||'')+' '+(e.textContent||'')).replace(/\\s+/g,' ').trim())); if (b) b.click(); return JSON.stringify({ openedTerminal: Boolean(b) }) })()
//----
(() => { const tab = [...document.querySelectorAll('[role=tab],button,div')].find((e) => e.children.length < 4 && /^\s*Terminal\s*$/.test(e.textContent || '') && e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().height < 80); if (tab) tab.click(); return JSON.stringify({ selectedTerminalTab: Boolean(tab), xterm: document.querySelectorAll('.xterm').length, canvases: document.querySelectorAll('.xterm canvas').length }) })()
//----
(() => { const ta = document.querySelector('.xterm-helper-textarea'); if (!ta) return JSON.stringify({ typed: false }); ta.focus(); const dt = new DataTransfer(); dt.setData('text/plain', 'echo DENO-PTY-OK; uname -a'); ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); for (const type of ['keydown', 'keyup']) ta.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true })); return JSON.stringify({ typed: true }) })()
//----
(() => JSON.stringify({ status: [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && /terminal/i.test(e.textContent || '')).map((e) => e.textContent.trim()).slice(0, 4), canvases: document.querySelectorAll('.xterm canvas').length }))()
