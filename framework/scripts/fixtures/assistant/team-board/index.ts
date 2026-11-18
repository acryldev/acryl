/**
 * The Team Board of the Blends frame mockup (scenarios 1 and 10), as a plugin an agent would have built into an app: the app's first page and `/board` both
 * show the board, `/my-tasks` has a Due filter. The Assistant gate installs it into an app made from the agent template, so a visitor's question has
 * something to open, filter and fill in, and the app's first run shows the app itself rather than the template's placeholder page. The plugin mounts before
 * the template's own routes row (the extensions row is ahead of it in every template's `blend.yaml`), and the router answers from the first mount, so this
 * `/` is the app's home in production and in the frame's canvas alike. Due dates are counted from the day the page is served, so "this week" (today and the
 * six days after it) always holds the same two of Ana's tasks.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from 'acrylblends'

export const name = 'team-board'
export const inject = ['router']

interface Task {
  readonly title: string
  readonly who: string
  readonly column: 'To do' | 'Doing' | 'Done'
  /** Days from today; absent: no due date. */
  readonly due?: number
}

/** The person signed in to the board. */
const ME = 'Ana'

const TASKS: readonly Task[] = [
  { title: 'Write the onboarding email', who: 'Ana', column: 'To do', due: 3 },
  { title: 'Fix the invite link', who: 'Ben', column: 'To do', due: 2 },
  { title: 'Plan the retro', who: 'Cleo', column: 'To do' },
  { title: 'Quarterly report', who: 'Ana', column: 'To do', due: 12 },
  { title: 'Pricing page copy', who: 'Ana', column: 'Doing', due: 0 },
  { title: 'Calendar sync', who: 'Dev', column: 'Doing' },
  { title: 'Plan the offsite', who: 'Ana', column: 'Doing', due: 25 },
  { title: 'Team sign-in', who: 'Ben', column: 'Done' },
  { title: 'Board layout', who: 'Cleo', column: 'Done' },
  { title: 'Update the FAQ', who: 'Ana', column: 'Done' },
]

const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/gu, (char) => `&#${char.charCodeAt(0)};`)

/** A due date as the board writes it: "today", "tomorrow", or the weekday and date. */
function dueLabel(days: number, today: Date): string {
  if (days === 0) return 'due today'
  if (days === 1) return 'due tomorrow'
  const date = new Date(today)
  date.setDate(today.getDate() + days)
  return `due ${date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`
}

/** Which filter a task's due date falls in. */
const bucket = (due: number | undefined): 'today' | 'week' | 'later' | 'none' =>
  due === undefined ? 'none' : due === 0 ? 'today' : due < 7 ? 'week' : 'later'

const STYLE = `<style>
*{box-sizing:border-box}
body{margin:0;font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;background:#f6f4ef;color:#1d1c1a}
header{display:flex;align-items:center;gap:14px;height:52px;padding:0 18px;border-bottom:1px solid #e3dfd5;background:#fffdf8}
header b{font-size:16px}
header .sprint{color:#77736b}
header input{margin-left:auto;border:1px solid #e3dfd5;border-radius:7px;padding:5px 10px;width:200px;font:inherit;background:#fff}
.layout{display:grid;grid-template-columns:180px minmax(0,1fr);min-height:calc(100vh - 52px)}
nav{border-right:1px solid #e3dfd5;padding:14px 10px;display:flex;flex-direction:column;gap:2px;background:#fbf9f4}
nav a,nav span{padding:6px 9px;border-radius:6px;color:#77736b;text-decoration:none}
nav a[aria-current=page]{background:#efe9dc;color:#1d1c1a;font-weight:600}
main{padding:16px 18px;min-width:0}
h1{font-size:18px;margin:0 0 12px}
.board{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.col h2{margin:0 0 8px;font-size:12px;color:#77736b;text-transform:uppercase;letter-spacing:.06em}
.task{background:#fff;border:1px solid #e3dfd5;border-radius:8px;padding:9px 11px;margin-bottom:8px}
.task .who{color:#77736b;font-size:12px}
.today{color:#c2410c;font-weight:600}
.bar{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.bar select{font:inherit;padding:4px 8px;border:1px solid #e3dfd5;border-radius:7px;background:#fff}
.bar [role=status]{margin-left:auto;color:#77736b}
ul.mine{list-style:none;margin:0;padding:0;display:grid;gap:8px;max-width:640px}
ul.mine li[hidden]{display:none}
.newtask{max-width:420px;margin:18px 0 0;background:#fff;border:1px solid #e3dfd5;border-radius:8px;padding:12px 14px;display:grid;gap:8px}
.newtask h2{margin:0;font-size:14px}
.newtask label{font-size:12px;color:#77736b}
.newtask input{font:inherit;padding:6px 9px;border:1px solid #e3dfd5;border-radius:7px;background:#fff}
.newtask button{justify-self:start;font:inherit;padding:6px 14px;border:1px solid #1d1c1a;border-radius:7px;background:#1d1c1a;color:#fff}
.newtask [role=status]{margin:0;color:#77736b;font-size:12px}
</style>`

function page(title: string, current: '/board' | '/my-tasks', body: string): string {
  const link = (path: '/board' | '/my-tasks', label: string): string =>
    `<a href="${path}"${path === current ? ' aria-current="page"' : ''}>${label}</a>`
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} - Team Board</title>${STYLE}</head><body>
<header><b>Team Board</b><span class="sprint">Sprint 14</span><input type="search" aria-label="Search tasks" placeholder="Search tasks"></header>
<div class="layout"><nav aria-label="Board pages">${link('/board', 'Board')}${link('/my-tasks', 'My tasks')}<span>Calendar</span><span>People</span></nav>
<main>${body}</main></div></body></html>`
}

function boardPage(today: Date): string {
  const columns = (['To do', 'Doing', 'Done'] as const).map((column) => {
    const cards = TASKS.filter((task) => task.column === column)
      .map((task) => {
        const due =
          task.due === undefined
            ? ''
            : ` · <span class="${task.due === 0 ? 'today' : ''}">${dueLabel(task.due, today)}</span>`
        return `<div class="task">${escapeHtml(task.title)}<div class="who">${escapeHtml(task.who)}${due}</div></div>`
      })
      .join('')
    return `<section class="col" aria-label="${column}"><h2>${column}</h2>${cards}</section>`
  })
  // The new-task form runs in the page: Save puts the card on the board and says so, and nobody else's click does it. An assistant that was asked to
  // add a task fills the two fields and leaves Save to the person.
  const script = `<script>(function(){
var form=document.getElementById('new-task'),title=document.getElementById('new-title'),due=document.getElementById('new-due'),status=document.getElementById('new-status'),todo=document.querySelector('section[aria-label="To do"]');
form.addEventListener('submit',function(event){
  event.preventDefault();
  var text=title.value.trim();
  if(!text){status.textContent='A task needs a title.';return}
  var card=document.createElement('div');card.className='task';card.append(text);
  var who=document.createElement('div');who.className='who';who.textContent='${ME}'+(due.value.trim()?' · due '+due.value.trim():'');
  card.append(who);todo.append(card);
  title.value='';due.value='';
  status.textContent='Saved "'+text+'".'
})})()</script>`
  const form = `<form id="new-task" class="newtask" aria-label="New task"><h2>New task</h2><label for="new-title">Title</label><input id="new-title" name="title" type="text" autocomplete="off" required><label for="new-due">Due</label><input id="new-due" name="due" type="text" autocomplete="off" placeholder="e.g. Friday"><button type="submit">Save</button><p id="new-status" role="status"></p></form>`
  return page(
    'Board',
    '/board',
    `<h1>Board</h1><div class="board">${columns.join('')}</div>${form}${script}`,
  )
}

function myTasksPage(today: Date): string {
  const mine = TASKS.filter((task) => task.who === ME)
  const items = mine
    .map((task) => {
      const due = task.due === undefined ? 'no due date' : dueLabel(task.due, today)
      return `<li class="task" data-due="${bucket(task.due)}">${escapeHtml(task.title)}<div class="who">${escapeHtml(task.column)} · <span class="${task.due === 0 ? 'today' : ''}">${due}</span></div></li>`
    })
    .join('')
  // The filter runs in the page: choosing an option shows the matching tasks and says how many there are, with no page load.
  const script = `<script>(function(){
var select=document.getElementById('due'),items=[].slice.call(document.querySelectorAll('ul.mine li')),count=document.getElementById('count');
function apply(){var v=select.value,shown=0;items.forEach(function(li){var b=li.dataset.due,on=v==='all'||b===v||(v==='week'&&b==='today');li.hidden=!on;if(on)shown++});count.textContent=shown+(shown===1?' task':' tasks')}
select.addEventListener('change',apply);apply()})()</script>`
  return page(
    'My tasks',
    '/my-tasks',
    `<h1>My tasks</h1><div class="bar"><label for="due">Due</label><select id="due" name="due"><option value="all">Any time</option><option value="today">Today</option><option value="week">This week</option><option value="later">Later</option></select><span id="count" role="status"></span></div><ul class="mine" aria-label="${ME}'s tasks">${items}</ul>${script}`,
  )
}

export function apply(ctx: Context): void {
  const app = new Acryl()
    // The app's first page is the board: '/' and '/board' serve the same page, so production and the frame's canvas open on the app itself.
    .get('/', (c) => c.html(boardPage(new Date())))
    .get('/board', (c) => c.html(boardPage(new Date())))
    .get('/my-tasks', (c) => c.html(myTasksPage(new Date())))
  ctx.router.route('/', app)
}
