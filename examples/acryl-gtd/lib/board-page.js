/**
 * The standalone board page: plain HTML/CSS/JS (no React, no build step), served directly by this plugin's own
 * Host route so it is the app - open the URL, see your tasks, no chat message required. The chat-embedded
 * `gtd_board` tool (client.js) still exists for the agent to reference or act on, but a todo app whose own task
 * list only shows up after you ask a chat bot to "open the board" is broken UX (owner feedback, 2026-09-28); this
 * page is the fix. It talks to the same three routes (`/api/acryl-gtd/state`, `/capture`, `/triage`) client.js
 * uses, and reads/writes the same `.acryl/gtd.json`.
 */

export function boardPageHtml() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GTD Board</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.5 -apple-system, "Segoe UI", sans-serif; background: #0b0e14; color: #e7e9ee; }
  header { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-bottom: 1px solid #262b36; position: sticky; top: 0; background: #0b0e14; z-index: 2; }
  header h1 { font-size: 15px; margin: 0; font-weight: 700; }
  header .count { margin-left: auto; color: #8a8fa3; font-size: 12px; }
  .tabs { display: flex; gap: 6px; padding: 10px 16px 0; }
  .tabs button { border: 1px solid #262b36; background: #131722; color: #c4c8d4; border-radius: 999px; padding: 5px 14px; font: 600 12px inherit; cursor: pointer; }
  .tabs button.on { background: #1971c2; color: #fff; border-color: #1971c2; }
  main { padding: 14px 16px 40px; max-width: 980px; margin: 0 auto; }
  .view { display: none; }
  .view.on { display: block; }
  .cap { margin: 10px 0 16px; display: flex; gap: 8px; }
  .cap input { flex: 1; background: #131722; border: 1px solid #262b36; border-radius: 8px; padding: 9px 12px; color: inherit; font: inherit; }
  .cap button { border: 0; background: #1971c2; color: #fff; border-radius: 8px; padding: 0 16px; font: 600 13px inherit; cursor: pointer; }
  .buckets { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
  .bucket { border: 1px solid #262b36; background: #131722; border-radius: 8px; padding: 6px 12px; cursor: pointer; display: flex; gap: 8px; align-items: center; }
  .bucket.on { background: #1a2233; border-color: #1971c2; }
  .bucket .dot { width: 8px; height: 8px; border-radius: 999px; }
  .bucket .c { color: #8a8fa3; font-size: 11px; }
  .list-item { display: flex; align-items: center; gap: 10px; padding: 9px 4px; border-bottom: 1px solid #1a1f2b; }
  .list-item .t { flex: 1; }
  .list-item .meta { color: #8a8fa3; font-size: 11px; margin-left: 6px; }
  .tag { font-size: 11px; color: #4dabf7; background: #14202e; border-radius: 999px; padding: 0 8px; margin-right: 4px; cursor: pointer; border: 1px solid transparent; }
  .tag.on { border-color: #4dabf7; }
  .move { font-size: 10px; font-weight: 600; border: 1px solid #262b36; background: transparent; color: #8a8fa3; border-radius: 999px; padding: 2px 8px; margin-left: 4px; cursor: pointer; }
  .move:hover { color: #e7e9ee; border-color: #1971c2; }
  .board { display: grid; grid-template-columns: repeat(5, minmax(0,1fr)); gap: 10px; }
  .col { border: 1px solid #262b36; border-radius: 8px; min-height: 60px; }
  .col h3 { font-size: 12px; margin: 0; padding: 7px 8px; border-bottom: 1px solid #262b36; display: flex; gap: 6px; align-items: center; }
  .col .cards { padding: 6px; display: flex; flex-direction: column; gap: 6px; }
  .card { border: 1px solid #262b36; border-radius: 6px; padding: 6px 8px; background: #10141d; }
  .card .p { font-size: 10px; color: #8a8fa3; margin-bottom: 4px; }
  .cal-nav { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .cal-nav .sp { margin-left: auto; display: flex; gap: 6px; align-items: center; }
  .cal-nav button.nav { width: 24px; height: 24px; border-radius: 6px; border: 1px solid #262b36; background: #131722; color: inherit; cursor: pointer; }
  .cal-grid { display: grid; grid-template-columns: repeat(7, minmax(0,1fr)); gap: 4px; }
  .day { aspect-ratio: 1; border: 1px solid #262b36; border-radius: 6px; padding: 4px; font-size: 11px; font-family: monospace; position: relative; cursor: pointer; background: #131722; }
  .day.today { background: #14202e; }
  .day.sel { border-color: #1971c2; border-width: 1.5px; }
  .day .n { position: absolute; bottom: 3px; right: 3px; width: 15px; height: 15px; border-radius: 999px; background: #1971c2; color: #fff; font: 700 8px/15px inherit; text-align: center; }
  .due-list { margin-top: 10px; padding-top: 8px; border-top: 1px solid #262b36; }
  .proj-card { border: 1px solid #262b36; border-radius: 8px; padding: 8px 10px; margin-bottom: 8px; }
  .proj-card .bar { height: 4px; border-radius: 999px; background: #1a1f2b; margin: 6px 0; overflow: hidden; }
  .proj-card .bar i { display: block; height: 100%; background: #51cf66; }
  .empty { color: #8a8fa3; padding: 10px 4px; }
  .err { color: #ff6b6b; padding: 10px; }
</style>
</head>
<body>
<header><h1>GTD Board</h1><span class="count" id="count"></span></header>
<div class="tabs" id="tabs">
  <button data-v="list" class="on">List</button>
  <button data-v="board">Board</button>
  <button data-v="calendar">Calendar</button>
  <button data-v="projects">Projects</button>
</div>
<main>
  <div id="err"></div>
  <div class="cap">
    <input id="capTitle" placeholder="Capture something - press Enter" />
  </div>
  <div id="list" class="view on"></div>
  <div id="board" class="view"></div>
  <div id="calendar" class="view"></div>
  <div id="projects" class="view"></div>
</main>
<script>
(function () {
  var params = new URLSearchParams(location.search)
  var cwd = params.get('cwd') || ''
  var BUCKETS = ['inbox', 'next', 'waiting', 'someday', 'reference']
  var LABEL = { inbox: 'Inbox', next: 'Next Actions', waiting: 'Waiting For', someday: 'Someday/Maybe', reference: 'Reference' }
  var DOT = { inbox: '#f59f00', next: '#4dabf7', waiting: '#ff6b6b', someday: '#868e96', reference: '#51cf66' }
  var state = { items: [] }
  var bucket = 'next'
  var tag = ''
  var calMode = 'week'
  var today = new Date().toISOString().slice(0, 10)
  var calAnchor = today
  var calSelected = today

  function api(path, opts) {
    var u = path + (path.indexOf('?') === -1 ? '?' : '&') + 'cwd=' + encodeURIComponent(cwd)
    return fetch(opts && opts.method === 'POST' ? path : u, opts).then(function (r) {
      if (!r.ok) return r.json().catch(function () { return {} }).then(function (b) { throw new Error(b.error || ('HTTP ' + r.status)) })
      return r.json()
    })
  }
  function post(path, body) {
    return fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.assign({ cwd: cwd }, body)) })
      .then(function (r) { if (!r.ok) return r.json().catch(function () { return {} }).then(function (b) { throw new Error(b.error || ('HTTP ' + r.status)) }); return r.json() })
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] }) }
  function itemLabel(item) {
    var bits = [esc(item.title)]
    if (item.project) bits.push('<span class="meta">[' + esc(item.project) + ']</span>')
    if (item.due) bits.push('<span class="meta">due ' + item.due + '</span>')
    return bits.join(' ')
  }
  function setErr(message) { document.getElementById('err').innerHTML = message ? '<div class="err">' + esc(message) + '</div>' : '' }

  function load() {
    api('/api/acryl-gtd/state').then(function (s) { state = s; setErr(''); renderAll() }).catch(function (e) { setErr('GTD board: ' + e.message) })
  }
  function triage(id, status) {
    post('/api/acryl-gtd/triage', { id: id, status: status }).then(function (s) { state = s; renderAll() }).catch(function (e) { setErr(e.message) })
  }
  function capture(title) {
    post('/api/acryl-gtd/capture', { title: title }).then(function (s) { state = s; renderAll() }).catch(function (e) { setErr(e.message) })
  }

  document.getElementById('capTitle').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.value.trim() !== '') { capture(e.target.value.trim()); e.target.value = '' }
  })
  document.getElementById('tabs').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-v]'); if (!b) return
    document.querySelectorAll('#tabs button').forEach(function (x) { x.classList.toggle('on', x === b) })
    document.querySelectorAll('.view').forEach(function (v) { v.classList.toggle('on', v.id === b.dataset.v) })
  })

  function moveButtons(item) {
    return BUCKETS.filter(function (b) { return b !== item.status }).map(function (b) {
      return '<button class="move" data-id="' + item.id + '" data-status="' + b + '">' + LABEL[b] + '</button>'
    }).join('') + '<button class="move" data-id="' + item.id + '" data-status="done" style="color:#51cf66;border-color:#51cf66">Done</button>'
  }

  function renderList() {
    var el = document.getElementById('list')
    var allTags = Array.from(new Set(state.items.reduce(function (a, i) { return a.concat(i.tags) }, []))).sort()
    var html = '<div class="buckets">' + BUCKETS.map(function (b) {
      var n = state.items.filter(function (i) { return i.status === b }).length
      return '<div class="bucket ' + (bucket === b ? 'on' : '') + '" data-b="' + b + '"><span class="dot" style="background:' + DOT[b] + '"></span>' + LABEL[b] + '<span class="c">' + n + '</span></div>'
    }).join('') + '</div>'
    if (allTags.length) html += '<div style="margin-bottom:8px">' + allTags.map(function (t) { return '<span class="tag ' + (tag === t ? 'on' : '') + '" data-tag="' + esc(t) + '">@' + esc(t) + '</span>' }).join('') + '</div>'
    var items = state.items.filter(function (i) { return i.status === bucket && (tag === '' || i.tags.indexOf(tag) !== -1) })
    html += items.length === 0 ? '<div class="empty">(nothing here)</div>' : items.map(function (i) {
      return '<div class="list-item"><span class="meta" style="width:26px">#' + i.id + '</span><span class="t">' + itemLabel(i) + '</span>' + moveButtons(i) + '</div>'
    }).join('')
    el.innerHTML = html
    el.querySelectorAll('.bucket').forEach(function (b) { b.addEventListener('click', function () { bucket = b.dataset.b; renderList() }) })
    el.querySelectorAll('.tag').forEach(function (t) { t.addEventListener('click', function () { tag = tag === t.dataset.tag ? '' : t.dataset.tag; renderList() }) })
    el.querySelectorAll('.move').forEach(function (m) { m.addEventListener('click', function () { triage(Number(m.dataset.id), m.dataset.status) }) })
  }

  function renderBoard() {
    var el = document.getElementById('board')
    el.innerHTML = '<div class="board">' + BUCKETS.map(function (b) {
      var items = state.items.filter(function (i) { return i.status === b })
      return '<div class="col"><h3><span class="dot" style="width:8px;height:8px;border-radius:999px;background:' + DOT[b] + '"></span>' + LABEL[b] + '<span class="meta" style="margin-left:auto">' + items.length + '</span></h3><div class="cards">' +
        items.map(function (i) { return '<div class="card">' + (i.project ? '<div class="p">' + esc(i.project) + '</div>' : '') + esc(i.title) + '<div>' + moveButtons(i) + '</div></div>' }).join('') +
        '</div></div>'
    }).join('') + '</div>'
    el.querySelectorAll('.move').forEach(function (m) { m.addEventListener('click', function () { triage(Number(m.dataset.id), m.dataset.status) }) })
  }

  function isoDay(d) { return d.toISOString().slice(0, 10) }
  function addDays(day, n) { var d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return isoDay(d) }
  function startOfWeek(day) { var d = new Date(day + 'T00:00:00Z'); var dow = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dow); return isoDay(d) }
  function startOfMonth(day) { return day.slice(0, 7) + '-01' }

  function renderCalendar() {
    var el = document.getElementById('calendar')
    var byDay = {}
    state.items.forEach(function (i) { if (i.due && i.status !== 'done' && i.status !== 'trash') (byDay[i.due] = byDay[i.due] || []).push(i) })
    var days
    if (calMode === 'day') days = [calAnchor]
    else if (calMode === 'week') { var s = startOfWeek(calAnchor); days = [0,1,2,3,4,5,6].map(function (n) { return addDays(s, n) }) }
    else { var f = startOfWeek(startOfMonth(calAnchor)); days = []; for (var n = 0; n < 42; n++) days.push(addDays(f, n)) }
    var html = '<div class="cal-nav">' + ['day','week','month'].map(function (m) { return '<button class="move' + (calMode === m ? ' on' : '') + '" data-mode="' + m + '" style="' + (calMode === m ? 'background:#1971c2;color:#fff;border-color:#1971c2' : '') + '">' + m[0].toUpperCase() + m.slice(1) + '</button>' }).join(' ') +
      '<span class="sp"><button class="nav" data-nav="-1">&lt;</button><span class="meta">' + calAnchor + '</span><button class="nav" data-nav="1">&gt;</button></span></div>'
    html += '<div class="cal-grid">' + days.map(function (d) {
      var n = (byDay[d] || []).length
      return '<div class="day' + (d === today ? ' today' : '') + (d === calSelected ? ' sel' : '') + '" data-day="' + d + '">' + d.slice(8, 10) + (n ? '<span class="n">' + n + '</span>' : '') + '</div>'
    }).join('') + '</div>'
    html += '<div class="due-list"><div class="meta" style="margin-bottom:4px">Due ' + calSelected + '</div>' +
      ((byDay[calSelected] || []).length === 0 ? '<div class="empty">(nothing due)</div>' : (byDay[calSelected] || []).map(function (i) { return '<div style="padding:3px 0">' + itemLabel(i) + '</div>' }).join('')) + '</div>'
    el.innerHTML = html
    el.querySelectorAll('[data-mode]').forEach(function (b) { b.addEventListener('click', function () { calMode = b.dataset.mode; renderCalendar() }) })
    el.querySelectorAll('[data-nav]').forEach(function (b) { b.addEventListener('click', function () { var n = Number(b.dataset.nav); calAnchor = calMode === 'month' ? addDays(startOfMonth(calAnchor), n * 31) : addDays(calAnchor, n * (calMode === 'day' ? 1 : 7)); renderCalendar() }) })
    el.querySelectorAll('[data-day]').forEach(function (d) { d.addEventListener('click', function () { calSelected = d.dataset.day; renderCalendar() }) })
  }

  function renderProjects() {
    var el = document.getElementById('projects')
    var byProject = {}
    state.items.forEach(function (i) { if (i.project) { (byProject[i.project] = byProject[i.project] || []).push(i) } })
    var names = Object.keys(byProject).sort()
    if (names.length === 0) { el.innerHTML = '<div class="empty">(no items have a project yet)</div>'; return }
    el.innerHTML = names.map(function (p) {
      var items = byProject[p]
      var done = items.filter(function (i) { return i.status === 'done' }).length
      var pct = Math.round(done / items.length * 100)
      return '<div class="proj-card"><b>' + esc(p) + '</b> <span class="meta">' + (items.length - done) + ' open, ' + done + ' done</span>' +
        '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
        items.map(function (i) { return '<div style="font-size:11px' + (i.status === 'done' ? ';color:#8a8fa3;text-decoration:line-through' : '') + '">' + itemLabel(i) + '</div>' }).join('') + '</div>'
    }).join('')
  }

  function renderAll() {
    document.getElementById('count').textContent = state.items.length + ' item(s)'
    renderList(); renderBoard(); renderCalendar(); renderProjects()
  }

  load()
})()
</script>
</body>
</html>
`
}
