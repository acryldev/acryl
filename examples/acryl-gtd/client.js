// acryl-gtd board (browser half)
// Type:     client-slot (tool renderer, key 'gtd_board')
// Surfaces: web desktop
// Teaches:  a `tool.call.toolview` card that is genuinely interactive. The slot itself only renders one call's own
//           args/result (no built-in way to invoke another tool from a click), so real interactivity - inline
//           triage, a kanban board you can move cards on, a calendar you can page through - needs its own Host
//           route: this plugin's `index.js` registers same-origin loopback GET/POST routes under
//           `/api/acryl-gtd/`, and this file's fetch() calls them directly. No build step, no JSX.
// Expect:   calling `gtd_board` renders buckets, an inline-triage list with a context filter, a board, a
//           day/week/month calendar and project progress - all reading and writing the same `.acryl/gtd.json`
//           the tools use.
window.__ModuleLoader__.load({ id: 'acryl-gtd', factory: (require) => {
var module = { exports: {} }; var exports = module.exports;

const React = require('react')
const h = React.createElement
const { useCallback, useEffect, useMemo, useState } = React

const BORDER = 'var(--dsw-alias-border-l1, #ffffff26)'
const MUTED = 'var(--dsw-alias-fg-muted, #9a9aa5)'
const BUCKETS = ['inbox', 'next', 'waiting', 'someday', 'reference']
const BUCKET_LABEL = { inbox: 'Inbox', next: 'Next Actions', waiting: 'Waiting For', someday: 'Someday/Maybe', reference: 'Reference' }
const BUCKET_DOT = { inbox: '#f59f00', next: '#4dabf7', waiting: '#ff6b6b', someday: '#868e96', reference: '#51cf66' }

function apiState(cwd) { return fetch('/api/acryl-gtd/state?cwd=' + encodeURIComponent(cwd)).then(r => { if (!r.ok) throw new Error('load failed (' + r.status + ')'); return r.json() }) }
function apiTriage(cwd, patch) {
  return fetch('/api/acryl-gtd/triage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cwd, ...patch }) })
    .then(async r => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || ('triage failed (' + r.status + ')')); return r.json() })
}

function itemLabel(item) {
  const bits = [item.title]
  if (item.project) bits.push('[' + item.project + ']')
  if (item.due) bits.push('(due ' + item.due + ')')
  return bits.join(' ')
}

function Chip({ children, on, onClick, tone }) {
  return h('button', {
    type: 'button', onClick,
    style: {
      border: '1px solid ' + BORDER, borderRadius: 999, padding: '2px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
      background: on ? (tone || '#4dabf733') : 'transparent', color: on ? '#fff' : MUTED,
    },
  }, children)
}

function MoveButtons({ item, onMove, busy }) {
  return h('div', { style: { display: 'flex', gap: 4, flexWrap: 'wrap' } },
    BUCKETS.filter(b => b !== item.status).map(b => h('button', {
      key: b, type: 'button', disabled: busy === item.id, title: 'Move to ' + BUCKET_LABEL[b],
      onClick: () => onMove(item.id, b),
      style: { fontSize: 10, fontWeight: 600, borderRadius: 999, border: '1px solid ' + BORDER, background: 'transparent', color: MUTED, padding: '2px 8px', cursor: busy === item.id ? 'default' : 'pointer', opacity: busy === item.id ? 0.5 : 1 },
    }, BUCKET_LABEL[b])),
    h('button', {
      type: 'button', disabled: busy === item.id, title: 'Mark done', onClick: () => onMove(item.id, 'done'),
      style: { fontSize: 10, fontWeight: 600, borderRadius: 999, border: '1px solid #51cf66', background: 'transparent', color: '#51cf66', padding: '2px 8px', cursor: busy === item.id ? 'default' : 'pointer', opacity: busy === item.id ? 0.5 : 1 },
    }, 'Done'))
}

function ListView({ items, triage, busy }) {
  const [bucket, setBucket] = useState('next')
  const [tag, setTag] = useState('')
  const allTags = useMemo(() => [...new Set(items.flatMap(item => item.tags))].sort(), [items])
  const inBucket = items.filter(item => item.status === bucket)
  const filtered = tag === '' ? inBucket : inBucket.filter(item => item.tags.includes(tag))
  return h('div', { style: { display: 'flex', gap: 12 } },
    h('div', { style: { width: 160, flex: 'none', display: 'flex', flexDirection: 'column', gap: 2 } },
      BUCKETS.map(b => h('button', {
        key: b, type: 'button', onClick: () => setBucket(b),
        style: {
          display: 'flex', gap: 8, alignItems: 'center', textAlign: 'left', padding: '6px 8px', borderRadius: 6, border: 0, cursor: 'pointer',
          background: bucket === b ? 'var(--dsw-alias-bg-l2, #ffffff14)' : 'transparent', color: 'inherit', font: 'inherit',
        },
      }, h('span', { style: { width: 8, height: 8, borderRadius: 999, background: BUCKET_DOT[b], flex: 'none' } }),
        h('span', { style: { flex: 1 } }, BUCKET_LABEL[b]),
        h('span', { style: { fontSize: 10, color: MUTED } }, items.filter(item => item.status === b).length)))),
    h('div', { style: { flex: 1, minWidth: 0 } },
      allTags.length > 0 && h('div', { style: { display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' } },
        h(Chip, { on: tag === '', onClick: () => setTag('') }, 'All'),
        allTags.map(t => h(Chip, { key: t, on: tag === t, onClick: () => setTag(tag === t ? '' : t) }, '@' + t))),
      filtered.length === 0
        ? h('div', { style: { color: MUTED, fontSize: 12, padding: '6px 2px' } }, '(nothing here)')
        : filtered.map(item => h('div', {
            key: item.id, style: { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 4px', borderBottom: '1px solid ' + BORDER },
          },
            h('span', { style: { fontSize: 10, fontFamily: 'monospace', color: MUTED, width: 26, flex: 'none' } }, '#' + item.id),
            h('span', { style: { flex: 1, minWidth: 0 } }, itemLabel(item)),
            h(MoveButtons, { item, onMove: triage, busy })))))
}

function BoardView({ items, triage, busy }) {
  return h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 10 } },
    BUCKETS.map(b => h('div', { key: b, style: { minWidth: 0, border: '1px solid ' + BORDER, borderRadius: 8, display: 'flex', flexDirection: 'column' } },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderBottom: '1px solid ' + BORDER, fontSize: 11, fontWeight: 600 } },
        h('span', { style: { width: 8, height: 8, borderRadius: 999, background: BUCKET_DOT[b] } }), BUCKET_LABEL[b],
        h('span', { style: { marginLeft: 'auto', color: MUTED, fontWeight: 400 } }, items.filter(item => item.status === b).length)),
      h('div', { style: { padding: 6, display: 'flex', flexDirection: 'column', gap: 6, minHeight: 40 } },
        items.filter(item => item.status === b).map(item => h('div', {
          key: item.id, style: { border: '1px solid ' + BORDER, borderRadius: 6, padding: '6px 8px', fontSize: 12 },
        },
          h('div', { style: { marginBottom: 4, overflowWrap: 'anywhere' } }, item.title),
          item.project && h('div', { style: { fontSize: 10, color: MUTED, marginBottom: 4 } }, item.project),
          h(MoveButtons, { item, onMove: triage, busy })))))))
}

function isoDay(date) { return date.toISOString().slice(0, 10) }
function addDays(day, n) { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return isoDay(d) }
function startOfWeek(day) { const d = new Date(day + 'T00:00:00Z'); const dow = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dow); return isoDay(d) }
function startOfMonth(day) { return day.slice(0, 7) + '-01' }

function CalendarView({ items }) {
  const today = isoDay(new Date())
  const [mode, setMode] = useState('week')
  const [anchor, setAnchor] = useState(today)
  const [selected, setSelected] = useState(today)
  const byDay = useMemo(() => { const map = {}; for (const item of items) { if (item.due && item.status !== 'done' && item.status !== 'trash') (map[item.due] = map[item.due] || []).push(item) } return map }, [items])
  const step = mode === 'day' ? 1 : mode === 'week' ? 7 : 30
  const nav = n => setAnchor(mode === 'month' ? addDays(startOfMonth(anchor), n * 31) : addDays(anchor, n * step))
  let days
  if (mode === 'day') days = [anchor]
  else if (mode === 'week') { const start = startOfWeek(anchor); days = Array.from({ length: 7 }, (_, i) => addDays(start, i)) }
  else { const start = startOfMonth(anchor); const first = startOfWeek(start); days = Array.from({ length: 42 }, (_, i) => addDays(first, i)) }
  const dayCell = day => h('button', {
    key: day, type: 'button', onClick: () => setSelected(day),
    style: {
      aspectRatio: '1', minWidth: 0, borderRadius: 6, border: (day === selected ? '1.5px solid #4dabf7' : '1px solid ' + BORDER),
      background: day === today ? '#4dabf722' : 'transparent', color: day.slice(5, 7) === anchor.slice(5, 7) || mode !== 'month' ? 'inherit' : MUTED,
      fontSize: 11, fontFamily: 'monospace', padding: 4, position: 'relative', cursor: 'pointer',
    },
  }, day.slice(8, 10), (byDay[day] || []).length > 0 && h('span', {
    style: { position: 'absolute', bottom: 3, right: 3, width: 14, height: 14, borderRadius: 999, background: '#4dabf7', color: '#fff', fontSize: 8, lineHeight: '14px', fontWeight: 700 },
  }, byDay[day].length))
  return h('div', null,
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 } },
      ['day', 'week', 'month'].map(m => h(Chip, { key: m, on: mode === m, onClick: () => setMode(m) }, m[0].toUpperCase() + m.slice(1))),
      h('span', { style: { marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' } },
        h('button', { type: 'button', onClick: () => nav(-1), style: navBtn }, '<'),
        h('span', { style: { fontSize: 11, color: MUTED, fontFamily: 'monospace' } }, anchor),
        h('button', { type: 'button', onClick: () => nav(1), style: navBtn }, '>'))),
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 } }, days.map(dayCell)),
    h('div', { style: { marginTop: 10, borderTop: '1px solid ' + BORDER, paddingTop: 8 } },
      h('div', { style: { fontSize: 11, color: MUTED, marginBottom: 4 } }, 'Due ' + selected),
      (byDay[selected] || []).length === 0
        ? h('div', { style: { color: MUTED, fontSize: 12 } }, '(nothing due)')
        : (byDay[selected] || []).map(item => h('div', { key: item.id, style: { fontSize: 12, padding: '3px 0' } }, itemLabel(item)))))
}
const navBtn = { width: 22, height: 22, borderRadius: 6, border: '1px solid ' + BORDER, background: 'transparent', color: 'inherit', cursor: 'pointer' }

function ProjectsView({ items }) {
  const byProject = useMemo(() => {
    const map = new Map()
    for (const item of items) {
      if (!item.project) continue
      const entry = map.get(item.project) || { project: item.project, items: [] }
      entry.items.push(item); map.set(item.project, entry)
    }
    return [...map.values()].sort((a, b) => a.project.localeCompare(b.project))
  }, [items])
  if (byProject.length === 0) return h('div', { style: { color: MUTED, fontSize: 12 } }, '(no items have a project yet - triage one with a project name)')
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
    byProject.map(({ project, items: projectItems }) => {
      const done = projectItems.filter(item => item.status === 'done').length
      const pct = Math.round((done / projectItems.length) * 100)
      return h('div', { key: project, style: { border: '1px solid ' + BORDER, borderRadius: 8, padding: '8px 10px' } },
        h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8 } },
          h('b', null, project), h('span', { style: { color: MUTED, fontSize: 11 } }, (projectItems.length - done) + ' open, ' + done + ' done')),
        h('div', { style: { height: 4, borderRadius: 999, background: 'var(--dsw-alias-bg-l2, #ffffff14)', margin: '6px 0', overflow: 'hidden' } },
          h('div', { style: { height: '100%', width: pct + '%', background: '#51cf66' } })),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
          projectItems.map(item => h('div', { key: item.id, style: { fontSize: 11, color: item.status === 'done' ? MUTED : 'inherit', textDecoration: item.status === 'done' ? 'line-through' : 'none' } }, itemLabel(item)))))
    }))
}

function GtdBoard({ cwd }) {
  const [state, setState] = useState(null)
  const [err, setErr] = useState(null)
  const [view, setView] = useState('list')
  const [busy, setBusy] = useState(null)

  const load = useCallback(() => { apiState(cwd).then(setState).catch(cause => setErr(String(cause.message || cause))) }, [cwd])
  useEffect(() => { load() }, [load])

  const triage = useCallback((id, status) => {
    setBusy(id)
    apiTriage(cwd, { id, status }).then(next => { setState(next); setBusy(null) }).catch(cause => { setErr(String(cause.message || cause)); setBusy(null) })
  }, [cwd])

  if (err) return h('div', { style: { padding: 10, color: '#e03131', fontSize: 12 } }, 'GTD board: ' + err)
  if (!state) return h('div', { style: { padding: 10, color: MUTED, fontSize: 12 } }, 'Loading the GTD board...')

  const tabs = [['list', 'List'], ['board', 'Board'], ['calendar', 'Calendar'], ['projects', 'Projects']]
  return h('div', { 'data-acryl-gtd-board': true, style: { border: '1px solid ' + BORDER, borderRadius: 10, padding: 10, margin: '4px 0' } },
    h('div', { style: { display: 'flex', gap: 6, marginBottom: 10 } },
      tabs.map(([key, label]) => h(Chip, { key, on: view === key, onClick: () => setView(key) }, label)),
      h('span', { style: { marginLeft: 'auto', fontSize: 11, color: MUTED } }, state.items.length + ' item(s)')),
    view === 'list' && h(ListView, { items: state.items, triage, busy }),
    view === 'board' && h(BoardView, { items: state.items, triage, busy }),
    view === 'calendar' && h(CalendarView, { items: state.items }),
    view === 'projects' && h(ProjectsView, { items: state.items }))
}

// Required service: the slot registry.
exports.inject = ['slots']

exports.apply = function apply(ctx) {
  ctx.slots.inject('tool.call.toolview', () =>
    ctx.slots.register({ name: 'tool.call.toolview', key: 'gtd_board' }, ({ cwd }) => h(GtdBoard, { cwd })))
}

return module.exports; } });
