// Example: client-workspace-tab.whiteboard  (browser half)
// Type:     client-slot
// Surfaces: web desktop
// Teaches:  a tab TYPE of your own: register it in `ctx.workspaceTabs` with a namespaced kind, a label, a one-line
//           description, a glyph and a React component. The workspace owns the tab; the component gets its saved
//           `state` (text) and `setState`, so a drawing survives closing the app. No build step, no JSX.
// Expect:   "Whiteboard" in the + menu, the command palette and Settings > Tabs; opening it gives a canvas you draw on
//           with the pointer; the drawing is still there after a reload.
// Docs:     extending.workspace-tab
// Pattern:  docs/extending/workspace-tab.md
// Status:   written against the real registry contract; verify in the real UI after installing (reload the page).
window.__ModuleLoader__.load({ id: 'acryl-example-workspace-tab', factory: (require) => {
var module = { exports: {} }; var exports = module.exports;

const React = require('react')
const h = React.createElement
const WIDTH = 1200
const HEIGHT = 800

// The tab's state is JSON text: a list of strokes, each a list of [x, y] points.
function parse(state) {
  try { const value = JSON.parse(state || '[]'); return Array.isArray(value) ? value : [] } catch { return [] }
}

function draw(canvas, strokes) {
  const c = canvas.getContext('2d')
  c.clearRect(0, 0, WIDTH, HEIGHT)
  c.lineWidth = 3; c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = '#4d6bfe'
  for (const stroke of strokes) {
    c.beginPath()
    stroke.forEach(([x, y], i) => { if (i === 0) c.moveTo(x, y); else c.lineTo(x, y) })
    c.stroke()
  }
}

function Whiteboard({ state, setState }) {
  const ref = React.useRef(null)
  const strokes = React.useRef(parse(state))
  const drawing = React.useRef(false)
  React.useEffect(() => { if (ref.current) draw(ref.current, strokes.current) }, [])
  const point = event => {
    const box = ref.current.getBoundingClientRect()
    return [Math.round((event.clientX - box.left) * WIDTH / box.width), Math.round((event.clientY - box.top) * HEIGHT / box.height)]
  }
  const save = () => setState(JSON.stringify(strokes.current))
  return h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, padding: 8, gap: 8 } },
    h('div', null, h('button', { type: 'button', onClick: () => { strokes.current = []; draw(ref.current, strokes.current); save() } }, 'Clear')),
    h('canvas', {
      ref, width: WIDTH, height: HEIGHT, 'aria-label': 'Whiteboard',
      style: { flex: 1, minHeight: 0, width: '100%', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 8, touchAction: 'none', cursor: 'crosshair' },
      onPointerDown: event => { drawing.current = true; ref.current.setPointerCapture(event.pointerId); strokes.current.push([point(event)]); draw(ref.current, strokes.current) },
      onPointerMove: event => { if (!drawing.current) return; strokes.current[strokes.current.length - 1].push(point(event)); draw(ref.current, strokes.current) },
      onPointerUp: () => { if (drawing.current) { drawing.current = false; save() } },
    }))
}

// Required service: the workspace's tab registry (this plugin is PENDING until the workspace is there).
exports.inject = ['workspaceTabs']

exports.apply = function apply(ctx) {
  // `ctx.effect` owns the registration: it is removed when this plugin is disabled or unloaded, and the tabs
  // already open keep their state and show a "plugin is off" note until it returns.
  ctx.effect(() => ctx.workspaceTabs.register({
    kind: 'acryl-example.whiteboard',
    label: 'Whiteboard',
    description: 'A quick whiteboard to sketch on with the pointer.',
    glyph: '✎',
    component: Whiteboard,
  }), 'acryl-example-workspace-tab: tab type')
}

return module.exports; } });
