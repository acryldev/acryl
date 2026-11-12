// The launcher in a terminal (spec 050, T003): it draws the session of acryl-launcher with acryl-ui-tui and pi-tui and turns keys into answers.
// It holds no step, rule or command line of its own: the list of things to do, the questions, the checks and the command all come from the
// session. Keys: arrows choose, Enter goes on, Esc goes back (from the list of things to do it quits), Ctrl-C quits.
//
// The view is a pi-tui component (`render(width)`, `handleInput(data)`), so a test drives it with key strings and reads what it draws,
// without a terminal. `finish(result)` is called once: `{ command, line }` to run, or undefined to quit.
import { SelectList, matchesKey, truncateToWidth, wrapTextWithAnsi } from '@earendil-works/pi-tui'
import { JOURNEYS, createSession } from 'acryl-launcher'
import { createTuiUi } from 'acryl-ui-tui'

const bold = text => `\x1b[1m${text}\x1b[22m`
const MENU_ROWS = JOURNEYS.length
const HOME_ROWS = 12

/** The three kinds of app (spec 050 D10), in the words the desktop screen uses; CLI (TUI) is listed but not yet made. */
const SURFACE_LABEL = { web: 'Web', desktop: 'Desktop', tui: 'CLI (TUI)' }

/** The rows of the home list after the apps (the mockup's footer: + New app, Blends store, Health), each opening one journey. */
const ACTIONS = Object.freeze([
  { value: 'journey:create', label: '+ New app', description: 'asks where it goes, suggests ~/ACRYL' },
  { value: 'journey:blend', label: 'Blends store', description: 'install a ready app from the registry' },
  { value: 'journey:add', label: 'Add an app folder', description: 'an app you already have' },
  { value: 'journey:model', label: 'Set up a model', description: 'your DeepSeek key, once, for every app' },
  { value: 'journey:check', label: 'Health', description: 'Node, npm, git, an agent, a free port' },
  { value: 'journey:code', label: 'ACRYL Code', description: 'the coding IDE, in this terminal' },
  { value: 'more', label: 'All things to do', description: 'every journey, including pull and share a plugin' },
])

export function createLauncherView({ context, theme, requestRender = () => {}, finish }) {
  const ui = createTuiUi(theme)
  const c = role => theme.color(role)
  // Colors are looked up when drawn, so a terminal that turns light or dark restyles the lists too.
  const listTheme = {
    selectedPrefix: text => c('primary')(text),
    selectedText: text => c('primary')(bold(text)),
    description: text => c('muted')(text),
    scrollInfo: text => c('muted')(text),
    noMatch: text => c('muted')(text),
  }
  // The one view state: the list of things to do, a question being loaded, or a session showing its state.
  let screen
  let list
  let field
  let done = false
  let pending = Promise.resolve()

  const close = result => {
    if (done) return
    done = true
    finish(result)
  }

  const apps = () => (context.registeredApps?.() ?? [])
  const begin = (journeyId, preset) => follow(createSession(journeyId, context, preset), session => session.begin())

  /** The first screen (spec 050 D6): the apps on this machine, then the things to do. Enter opens an app; u updates it; p pulls a plugin into it. */
  function showHome(selected) {
    const listed = apps()
    const rows = [
      ...listed.map(app => ({ value: `app:${app.path}`, label: app.id, description: `${app.state}  ${SURFACE_LABEL[app.surface] ?? 'Web'}  ${app.blend || 'Blend'}`, detail: app.state === 'missing' ? `${app.path} - the folder is gone` : app.path })),
      ...ACTIONS,
    ]
    list = new SelectList(rows, Math.min(HOME_ROWS, rows.length), listTheme)
    list.setSelectedIndex(Math.max(0, rows.findIndex(row => row.value === selected)))
    list.onSelect = item => {
      if (item.value === 'more') return showMore()
      if (item.value.startsWith('journey:')) return begin(item.value.slice('journey:'.length))
      const app = listed.find(entry => `app:${entry.path}` === item.value)
      if (app?.state === 'missing') return undefined   // nothing to open: its folder is gone; the row says so
      return begin('open', { app: app.path })
    }
    field = undefined
    screen = { kind: 'home', apps: listed }
  }

  /** Every journey, for the ones the home list does not name. */
  function showMore(selected) {
    list = new SelectList(JOURNEYS.map(entry => ({ value: entry.id, label: entry.title, description: entry.summary })), MENU_ROWS, listTheme)
    if (selected) list.setSelectedIndex(Math.max(0, JOURNEYS.findIndex(entry => entry.id === selected)))
    list.onSelect = item => begin(item.value)
    field = undefined
    screen = { kind: 'more' }
  }

  /** Wait for the session's next state, showing that something is happening meanwhile; undefined (back from the first step) is the menu. */
  function follow(session, step) {
    screen = { kind: 'busy', session }
    requestRender()
    pending = Promise.resolve(step(session)).then(
      state => {
        if (state === undefined) showHome()
        else present(session, state)
      },
      cause => { screen = { kind: 'failed', session, message: cause instanceof Error ? cause.message : String(cause) } },
    ).finally(requestRender)
    return pending
  }

  function present(session, state) {
    list = undefined
    field = undefined
    if (state.kind === 'step' && state.step.kind === 'choose' && state.options.length > 0) {
      list = new SelectList(state.options, Math.min(10, state.options.length), listTheme)
      const previous = session.answers[state.step.id]
      if (previous !== undefined) list.setSelectedIndex(Math.max(0, state.options.findIndex(option => option.value === previous)))
      list.onSelect = item => follow(session, s => s.answer(item.value))
    }
    if (state.kind === 'step' && state.step.kind === 'text') {
      field = ui.Field({
        label: state.step.label,
        value: state.initial,
        hint: state.step.hint ?? 'Enter to go on, Esc to go back',
        error: state.error,
        onSubmit: text => follow(session, s => s.answer(text)),
      })
    }
    screen = { kind: 'session', session, state }
  }

  function body() {
    if (screen.kind === 'home') {
      const title = screen.apps.length === 0 ? 'No apps yet - start one' : `Your apps (${String(screen.apps.length)})`
      return [ui.Card({ title, body: [list, highlighted(list, 'detail')] })]
    }
    if (screen.kind === 'more') return [ui.Card({ title: 'What do you want to do?', body: [list] })]
    if (screen.kind === 'busy') return [c('muted')('Working...')]
    if (screen.kind === 'failed') return [ui.Card({ title: 'Something went wrong', body: [c('error')(screen.message), '', c('muted')('Esc to go back')] })]
    const { state } = screen
    if (state.kind === 'ready') {
      return [ui.Card({
        title: `${state.title}: ready`,
        body: ['This runs now:', '', wrapped(c('primary')(bold(state.line))), '', c('muted')('Next time you can type it yourself.')],
      })]
    }
    const where = state.total > 1 ? `  ${c('muted')(`step ${state.index + 1} of ${state.total}`)}` : ''
    const parts = []
    if (state.step.kind === 'choose') {
      parts.push(c('primary')(state.step.label))
      if (state.error) parts.push(c('error')(state.error))
      parts.push(list ?? c('warning')(state.empty))
      // The list cuts a long description to one line; the highlighted one is shown whole, so a person knows what they are choosing.
      if (list) parts.push(highlighted(list))
    } else parts.push(field)
    return [ui.Card({ title: `${state.title}${where}`, body: parts })]
  }

  /** A line that wraps at the card's width instead of being cut: the command shown must be the whole command, however long the folder. */
  function wrapped(text) {
    return { render: width => wrapTextWithAnsi(text, width), invalidate() {} }
  }

  function highlighted(from, key = 'description') {
    return {
      render(width) {
        const item = from.getSelectedItem()
        const description = key === 'detail' ? item?.detail : item?.description
        if (!description) return []
        // At most three lines, so a long description never pushes the list off a 24-row terminal.
        const wrapped = wrapTextWithAnsi(c('muted')(description), width)
        const shown = wrapped.slice(0, 3)
        if (wrapped.length > 3) shown[2] = truncateToWidth(shown[2], Math.max(1, width - 3)) + c('muted')('...')
        return ['', ...shown]
      },
      invalidate() {},
    }
  }

  function keysHint() {
    if (screen.kind === 'home') return 'Up/Down choose   Enter open   u update   p pull a plugin   Esc quit'
    if (screen.kind === 'more') return 'Up/Down choose   Enter go   Esc back'
    if (screen.kind === 'session' && screen.state.kind === 'ready') return 'Enter run   Esc back   Ctrl-C quit'
    if (screen.kind === 'session' && screen.state.step?.kind === 'text') return 'Enter next   Esc back   Ctrl-C quit'
    return 'Up/Down choose   Enter next   Esc back   Ctrl-C quit'
  }

  showHome()

  return {
    /** Settles when the last answer has been handled (tests wait on it; the terminal just re-renders). */
    get settled() { return pending },
    render(width) {
      const header = `${c('primary')(bold('ACRYL'))}  ${c('muted')('every app on this machine, every step offered')}`
      return ui.Stack({ children: [header, '', ...body(), c('muted')(keysHint())], gap: 0 }).render(width).map(line => truncateToWidth(line, width))
    },
    handleInput(data) {
      if (done) return
      if (matchesKey(data, 'ctrl+c')) return close(undefined)
      if (screen.kind === 'busy') return
      if (matchesKey(data, 'escape')) {
        if (screen.kind === 'home') return close(undefined)
        if (screen.kind === 'more') return showHome('more')
        return follow(screen.session, session => session.back())
      }
      if (screen.kind === 'session' && screen.state.kind === 'ready') {
        if (matchesKey(data, 'enter') || matchesKey(data, 'return')) close({ command: screen.state.command, line: screen.state.line })
        return
      }
      if (screen.kind === 'home' && (data === 'u' || data === 'p')) {
        const row = list.getSelectedItem()
        if (row?.value.startsWith('app:')) return begin(data === 'u' ? 'update' : 'pull', { app: row.value.slice('app:'.length) })
      }
      ;(field ?? list)?.handleInput(data)
      requestRender()
    },
    invalidate() { list?.invalidate?.(); field?.invalidate?.() },
  }
}
