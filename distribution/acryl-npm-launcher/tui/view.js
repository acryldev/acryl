// ACRYL Control Center in a terminal: the same capabilities as the Control Center window, on the same service (@acryldev/launcher-desktop's
// LauncherService, wired to this machine by run.js): your apps (start in the browser or a window, stop, open, update, share to GitHub, deploy to
// WebBoxes.ai, pull and publish plugins), the Blends store by category, a new app from a starter, GitHub sign-in, the model key, ACRYL ADE and Health.
// The view holds no rule of its own: what an action does, and why it is refused, is the service's.
//
// The view is a pi-tui component: `render(width)` reads the view state and draws it without changing anything, `handleInput(data)` turns keys into
// actions, and `tick()` moves the animations and reads the service's state again. A test drives it with key strings and reads what it draws.
// The view state is one small closed union (`screen`):
//   menu      a titled list of choices (home, one app, the store, a Blend, a pick); `rows()` is read again on every refresh, so states stay live
//   ask       one line of text          secret   a key, shown as dots         confirm   a plan to say yes to
//   note      a result to read          busy     a promise under way          github    the device code while GitHub waits for the person
// `finish(result)` is called once: `{ command, line }` for the `acryl` command to run after the screen closes (the terminal agent), or undefined to quit.
import { SelectList, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi } from '@earendil-works/pi-tui'
import { nameFromId } from '@acryldev/launcher'
import { MARK_ROWS, TICK_MS, gradient, markLines, sectionTitle, shimmerAt, spinnerFrame, wordmark } from './brand.js'

const bold = text => `\x1b[1m${text}\x1b[22m`
const SURFACE_LABEL = { web: 'Web', desktop: 'Desktop', tui: 'CLI (TUI)' }
const STATE_MARK = { running: '●', starting: '◌', stopped: '○', missing: '✕' }
const TAGLINE = 'Everything is a plugin. Build agentic apps.'
/** WebBoxes.ai's page that makes a WebBox from a store Blend (the Control Center window's "Deploy to WebBoxes"). */
export const WEBBOXES_BLEND = 'https://webboxes.ai/dashboard/webboxes'
export const webboxesBlendUrl = id => `${WEBBOXES_BLEND}?blend=${encodeURIComponent(id)}`
/** The full mark is drawn when the terminal has room for it and the list under it; otherwise the one-line wordmark. */
const FULL_HEADER = { width: 60, rows: 36 }

const message = cause => (cause instanceof Error ? cause.message : String(cause))

/** A Blend's top category as a key: the registry writes `api-sdk`, a community Blend's placement `Application › Notes`; both are one shelf each. */
const categoryOf = blend => (blend.category || 'other').split(' › ')[0].trim().toLowerCase().replace(/\s+/gu, '-')
const ACRONYMS = new Set(['ai', 'api', 'sdk', 'hci', 'p2p', 'xr', 'iot', '3d', 'cad'])
/** `api-sdk` as a person reads it: `API SDK`; `aerospace-aviation`: `Aerospace aviation`. */
export const categoryLabel = key => key.split('-').map((word, index) => (ACRONYMS.has(word) ? word.toUpperCase() : index === 0 ? `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}` : word)).join(' ')

/** The store's shelves: All, Official, Community, then each category with how many Blends it has. Pure: the store screen and its test read it. */
export function storeShelves(blends) {
  const counts = new Map()
  for (const blend of blends) counts.set(categoryOf(blend), (counts.get(categoryOf(blend)) ?? 0) + 1)
  const official = blends.filter(blend => blend.origin === 'official')
  return [
    { value: 'all', label: `All Blends (${blends.length})`, test: () => true },
    { value: 'official', label: `Official (${official.length})`, description: 'made by the ACRYL project', test: blend => blend.origin === 'official' },
    { value: 'community', label: `Community (${blends.length - official.length})`, description: 'released by people on GitHub; not reviewed', test: blend => blend.origin !== 'official' },
    ...[...counts.keys()].sort().map(category => ({ value: `category:${category}`, label: `${categoryLabel(category)} (${counts.get(category)})`, test: blend => categoryOf(blend) === category })),
  ]
}

/** One app as a row of the home list: its state mark, name, and state, surface and Blend. Pure. */
export function appRow(app, tick = 0) {
  const mark = app.state === 'starting' ? spinnerFrame(tick) : STATE_MARK[app.state] ?? '○'
  const update = app.update ? `  update ${app.update}` : ''
  return { value: `app:${app.id}`, label: `${mark} ${app.name}`, description: `${app.state}  ${SURFACE_LABEL[app.surface] ?? 'Web'}  ${app.blend || 'Blend'}${update}` }
}

/**
 * @param {object} options
 * @param {object} options.service    LauncherService (or a test double with the same methods)
 * @param {{ problem(key, provider): string | undefined, save(key, provider): void }} options.model  the machine's model key (@acryldev/launcher)
 * @param {(github: string, name: string) => string} options.deployUrl  WebBoxes.ai's form for an app on GitHub (@acryldev/launcher-desktop)
 * @param {(target: string) => void} options.open  open a URL in the browser or a folder in the file manager
 * @param {{ mode: string, color(role: string): (text: string) => string }} options.theme
 * @param {boolean} options.color  false under NO_COLOR: no color at all, the gradients included
 * @param {() => number} options.rows  the terminal's height
 */
export function createControlCenterView({ service, model, deployUrl, open = () => {}, theme, color = true, rows = () => 40, requestRender = () => {}, finish, schedule = setTimeout, version }) {
  const c = role => (color ? theme.color(role) : text => text)
  const listTheme = {
    selectedPrefix: text => c('primary')(text),
    selectedText: text => c('primary')(bold(text)),
    description: text => c('muted')(text),
    scrollInfo: text => c('muted')(text),
    noMatch: () => c('muted')('  nothing matches'),
  }

  let screen
  let list
  let listKey = ''
  let snapshot = service.state()
  let tick = 0
  let done = false
  let pending = Promise.resolve()
  /** Apps started in the browser from here, whose address opens once it is known (the window does the same). */
  const opening = new Set()
  let polling

  const close = result => {
    if (done) return
    done = true
    polling = undefined
    finish(result)
  }

  // ---- screens -------------------------------------------------------------------------------------------------------------------------------

  const menu = (id, title, rowsOf, more = {}) => { show({ kind: 'menu', id, title, rows: rowsOf, query: '', ...more }) }
  const note = (title, lines, back = home) => { show({ kind: 'note', title, lines, back }) }
  const refuse = (cause, back) => { note('Not done', [c('error')(message(cause))], back) }

  function show(next) {
    screen = next
    list = undefined
    listKey = ''
    refresh()
    requestRender()
  }

  /** Run a promise behind the busy screen; its result goes to `then`, a refusal to a note that leads `back`. */
  function busy(title, label, promise, then, back = home) {
    show({ kind: 'busy', title, label })
    pending = Promise.resolve().then(() => promise()).then(then, cause => refuse(cause, back)).finally(requestRender)
    return pending
  }

  /** A synchronous service call: a refusal becomes a note instead of an exception in the key handler. */
  function attempt(run, back) {
    try { return run() } catch (cause) { refuse(cause, back); return undefined }
  }

  function home() {
    const app = id => snapshot.apps.find(entry => entry.id === id)
    menu('home', snapshot.apps.length === 0 ? 'No apps yet: make one' : `Your apps (${snapshot.apps.length})`, () => {
      const github = service.github()
      const key = service.maskedModelKey()
      return [
        ...snapshot.apps.map(entry => ({ ...appRow(entry, tick), run: () => showApp(entry.id) })),
        { value: 'new', label: '+ New app', description: `from a starter, in ${snapshot.appsFolder}`, run: newApp },
        { value: 'store', label: 'Blends store', description: 'ready apps by category: Official and Community', run: store },
        { value: 'add', label: 'Add an app folder', description: 'an app you already have', run: addFolder },
        { value: 'github', label: github?.login ? `GitHub: @${github.login}` : 'Connect GitHub', description: github?.login ? 'connected; Enter to disconnect' : 'one sign-in for sharing, publishing and pulling', run: githubMenu },
        { value: 'model', label: key ? `Model key: ${key}` : 'Set up a model', description: 'your DeepSeek or OrcaRouter key, once, for every app', run: modelKey },
        { value: 'ade', label: 'ACRYL ADE', description: 'the agent development environment: browser, window or terminal', run: ade },
        { value: 'health', label: 'Health', description: 'Node, npm, the model key, GitHub, the folders', run: health },
        { value: 'quit', label: 'Quit', description: 'web apps started here stop with it; a desktop app keeps its window', run: quit },
      ]
    }, { detail: () => { const row = list?.getSelectedItem(); const entry = row?.value.startsWith('app:') ? app(row.value.slice(4)) : undefined; return entry ? appDetail(entry) : [] } })
  }

  function appDetail(entry) {
    const lines = [c('muted')(entry.path)]
    if (entry.address) lines.push(`${c('success')('●')} ${c('primary')(entry.address)}`)
    if (entry.github) lines.push(c('muted')(`on GitHub: ${entry.github}`))
    if (entry.state === 'missing') lines.push(c('warning')('the folder is gone: remove it from the list, or put it back'))
    const tail = entry.failure ?? entry.output
    if (tail) lines.push(...tail.split('\n').slice(-3).map(line => (entry.failure ? c('error')(line) : c('muted')(line))))
    return lines
  }

  function showApp(id) {
    const current = () => snapshot.apps.find(entry => entry.id === id)
    const back = () => showApp(id)
    menu(`app:${id}`, current()?.name ?? id, () => {
      const app = current()
      if (app === undefined) return [{ value: 'back', label: 'Back', description: 'the app is no longer in the list', run: home }]
      const running = app.state === 'running' || app.state === 'starting'
      const web = { value: 'start-web', label: 'Start in the browser', description: 'npm run dev; its address opens when it is up', run: () => start(app, 'web') }
      const desktop = { value: 'start-desktop', label: 'Start in its own window', description: 'npm run desktop (Electron is fetched the first time)', run: () => start(app, 'desktop') }
      return [
        ...(running ? [{ value: 'stop', label: 'Stop', description: 'stops the app and everything it started', run: () => { attempt(() => service.stop(app.id), back); back() } }] : app.surface === 'desktop' ? [desktop, web] : [web, desktop]),
        ...(app.address ? [{ value: 'browse', label: 'Open in the browser', description: app.address, run: () => open(app.address) }] : []),
        { value: 'folder', label: 'Open its folder', description: app.path, run: () => open(app.path) },
        ...(app.update ? [{ value: 'update', label: `Update to ${app.update}`, description: `newer ${app.blend} release; your changes are kept (acrylblends update)`, run: () => { attempt(() => { service.update(app.id); home() }, back) } }] : []),
        { value: 'share', label: 'Share to GitHub', description: app.github ? `push the saved changes to ${app.github}` : 'a repository of your own; public apps are listed in the Blends store', run: () => share(app) },
        { value: 'deploy', label: 'Deploy to WebBoxes.ai', description: app.github ? 'open the New WebBox form with this app filled in' : 'share it to GitHub first', run: () => deploy(app) },
        { value: 'pull', label: 'Pull a plugin', description: 'github:owner/repo@version into this app (it must be running)', run: () => pull(app) },
        { value: 'publish', label: 'Publish a plugin', description: 'one of this app\'s own plugins, for others to pull (it must be running)', run: () => publish(app) },
        { value: 'remove', label: 'Remove from the list', description: 'the folder stays', run: () => show({ kind: 'confirm', title: `Remove ${app.name}?`, lines: [`${app.name} leaves the list. Its folder stays: ${app.path}`], yes: 'Remove', onYes: () => { attempt(() => { service.remove(app.id); home() }, back) }, back }) },
        { value: 'back', label: 'Back', run: home },
      ]
    }, { back: home, detail: () => (current() ? appDetail(current()) : []) })
  }

  function start(app, surface) {
    attempt(() => {
      service.start(app.id, surface)
      if (surface === 'web') opening.add(app.id)
      showApp(app.id)
    }, () => showApp(app.id))
  }

  function share(app) {
    const back = () => showApp(app.id)
    const plan = visibility => busy('Share to GitHub', 'Reading what sharing would send...', () => service.sharePlan({ id: app.id, ...(visibility ? { visibility } : {}) }), view => show({
      kind: 'confirm', title: 'Share to GitHub', back, yes: 'Share',
      lines: [
        `Repository: ${c('primary')(view.repository)}${view.create ? ' (new)' : ''}`,
        `Visibility: ${view.visibility}${view.visibility === 'public' ? '  (the Blends store lists it within the hour)' : ''}`,
        `Changes saved first: ${view.changes}`,
      ],
      onYes: () => busy('Share to GitHub', 'Saving and pushing...', () => service.share({ id: app.id, ...(visibility ? { visibility } : {}), plan: view }), result => note('Shared', [`${result.created ? 'Made and pushed' : 'Pushed'}: ${c('primary')(result.remote)}`, '', c('muted')('Deploy it to WebBoxes.ai from this app\'s list.')], back), back),
    }), back)
    if (app.github) return plan(undefined)
    return menu(`share:${app.id}`, 'Who may see it', () => [
      { value: 'public', label: 'Public', description: 'anyone; the Blends store lists it as a Community Blend', run: () => plan('public') },
      { value: 'private', label: 'Private', description: 'only you and the people you invite', run: () => plan('private') },
    ], { back })
  }

  function deploy(app) {
    if (!app.github) return note('Deploy to WebBoxes.ai', ['WebBoxes.ai deploys an app from GitHub: share it to GitHub first (Share to GitHub, in this app\'s list).'], () => showApp(app.id))
    const url = deployUrl(app.github, app.name)
    open(url)
    return note('Deploy to WebBoxes.ai', ['The New WebBox form opens in your browser with this app filled in. Sign in there and press Create.', '', c('primary')(url)], () => showApp(app.id))
  }

  function pull(app) {
    const back = () => showApp(app.id)
    show({
      kind: 'ask', title: `Pull a plugin into ${app.name}`, label: 'Plugin to pull', hint: 'github:owner/repo@version, or an npm package name', value: '', back,
      onSubmit: source => busy('Pull a plugin', `Pulling ${source}...`, () => service.pullPlugin(app.id, source), result => note('Pulled', [result.text], back), back),
    })
  }

  function publish(app) {
    const back = () => showApp(app.id)
    busy('Publish a plugin', 'Reading the app\'s plugins...', () => service.plugins(app.id), plugins => {
      const own = plugins.filter(plugin => plugin.pulledFrom === undefined)
      if (own.length === 0) return note('Publish a plugin', ['This app has no plugins of its own yet.'], back)
      return menu(`publish:${app.id}`, 'Which plugin', () => own.map(plugin => ({
        value: plugin.name, label: plugin.name, description: `${plugin.version} ${plugin.state}`.trim(),
        run: () => busy('Publish a plugin', 'Reading what publishing would send...', () => service.publishPlan({ id: app.id, plugin: plugin.name }), plan => show({
          kind: 'confirm', title: `Publish ${plugin.name}`, yes: 'Publish', back,
          lines: [`To: ${c('primary')(`${plan.owner}/${plan.repo}`)}${plan.createsRepository ? ' (new repository)' : ''}`, `Version: ${plan.version}   Visibility: ${plan.visibility}   License: ${plan.license}`, `Files: ${plan.files.length}`],
          onYes: () => busy('Publish a plugin', 'Publishing...', () => service.publish({ id: app.id, plugin: plugin.name, plan }), result => note('Published', [c('primary')(result.releaseUrl), '', `Others pull it with: ${result.pullLine}`], back), back),
        }), back),
      })), { back })
    }, back)
  }

  function newApp() {
    menu('starter', 'New app: start from', () => snapshot.starters.map(starter => ({
      value: starter.value, label: starter.label, description: starter.description,
      run: () => chooseSurface(`New ${starter.label} app`, surface => askName(`New ${starter.label} app`, 'my-app', name => service.create({ where: snapshot.appsFolder, name, starter: starter.value, surface }), newApp), newApp),
    })), { back: home })
  }

  function chooseSurface(title, then, back) {
    menu(`surface:${title}`, `${title}: open it in`, () => [
      { value: 'web', label: 'Web', description: 'in your browser (npm run dev)', run: () => then('web') },
      { value: 'desktop', label: 'Desktop', description: 'in its own window (npm run desktop)', run: () => then('desktop') },
    ], { back })
  }

  function askName(title, initial, make, back) {
    const submit = (name, error) => show({
      kind: 'ask', title, label: 'Name of the app', hint: `lower case letters, digits and dashes; it goes in ${snapshot.appsFolder}`, value: name, error, back,
      onSubmit: text => {
        try { make(text); home() } catch (cause) { submit(text, message(cause)) }
      },
    })
    submit(initial, undefined)
  }

  function store() {
    busy('Blends store', 'Reading the registry...', () => service.blends(), blends => menu('store', 'Blends store', () => storeShelves(blends).map(shelf => ({
      ...shelf, run: () => shelfOf(shelf.label.replace(/ \(\d+\)$/u, ''), blends.filter(shelf.test)),
    })), { back: home }))
  }

  function shelfOf(title, blends) {
    menu(`shelf:${title}`, title, () => blends.map(blend => ({
      value: blend.id, label: blend.name, description: `${blend.origin === 'official' ? 'Official' : `Community${blend.publisher ? ` by @${blend.publisher}` : ''}`}  ${blend.description}`,
      run: () => blendScreen(blend, () => shelfOf(title, blends)),
    })), { back: store, filterable: true })
  }

  function blendScreen(blend, back) {
    const here = () => blendScreen(blend, back)
    const make = surface => askName(`Make ${blend.name}`, nameFromId(blend.id), name => service.create({ where: snapshot.appsFolder, name, blend: blend.source ?? blend.id, surface }), here)
    menu(`blend:${blend.id}`, blend.name, () => [
      { value: 'web', label: 'Make it: Web', description: 'your own copy, in your browser', run: () => make('web') },
      { value: 'desktop', label: 'Make it: Desktop', description: 'your own copy, in its own window', run: () => make('desktop') },
      { value: 'deploy', label: 'Deploy to WebBoxes.ai', description: 'a hosted copy for you and your team', run: () => { const url = webboxesBlendUrl(blend.id); open(url); note('Deploy to WebBoxes.ai', ['WebBoxes.ai opens in your browser with this Blend chosen.', '', c('primary')(url)], here) } },
      { value: 'back', label: 'Back', run: back },
    ], {
      back,
      detail: () => [
        c('muted')(`${blend.id}${blend.version ? `  ${blend.version}` : ''}  ${blend.category || ''}`),
        ...(blend.description ? [blend.description] : []),
        ...(blend.origin === 'official' ? [] : [c('warning')(`A Community Blend, from ${blend.source}. Its code is not reviewed: make it only if you trust who released it.`)]),
      ],
    })
  }

  function addFolder() {
    const ask = (initial, error) => show({
      kind: 'ask', title: 'Add an app folder', label: 'The app\'s folder', hint: 'the whole path of a folder with a blend.yaml in it', value: initial, error, back: home,
      onSubmit: folder => { try { service.add(folder); home() } catch (cause) { ask(folder, message(cause)) } },
    })
    ask('', undefined)
  }

  function githubMenu() {
    const state = attempt(() => service.github(), home)
    if (state === undefined) return undefined
    if (state.login) {
      return show({ kind: 'confirm', title: 'GitHub', lines: [`Connected as @${state.login}. Disconnect this computer?`, c('muted')('Apps started from now on no longer get the token.')], yes: 'Disconnect', back: home, onYes: () => { attempt(() => service.githubDisconnect(), home); note('GitHub', ['Disconnected.']) } })
    }
    return busy('Connect GitHub', 'Asking GitHub for a code...', () => service.githubStart(), started => {
      show({ kind: 'github', userCode: started.userCode, uri: started.verificationUri, back: home })
      const poll = async () => {
        if (screen.kind !== 'github' || polling !== poll) return
        const answer = await service.githubPoll()
        if (screen.kind !== 'github' || polling !== poll) return
        if (answer.state === 'connected') { polling = undefined; note('GitHub', [`${c('success')('Connected')} as @${answer.login}. Every app started from here gets the token.`]) }
        else if (answer.state === 'failed') { polling = undefined; note('GitHub', [c('error')(answer.reason)]) }
        else schedule(poll, (answer.interval ?? started.interval) * 1000)
      }
      polling = poll
      schedule(poll, started.interval * 1000)
    })
  }

  function modelKey() {
    menu('model', 'Set up a model: which provider', () => [
      { value: 'deepseek', label: 'DeepSeek', description: 'a key from platform.deepseek.com', run: () => secret('deepseek') },
      { value: 'orcarouter', label: 'OrcaRouter', description: 'one key for many models', run: () => secret('orcarouter') },
    ], { back: home })
  }

  function secret(provider, error) {
    show({
      kind: 'secret', title: `Your ${provider === 'deepseek' ? 'DeepSeek' : 'OrcaRouter'} key`, label: 'Paste the key (it is not shown)', value: '', error, back: modelKey,
      onSubmit: key => {
        const problem = model.problem(key, provider)
        if (problem) return secret(provider, problem)
        try { model.save(key, provider) } catch (cause) { return secret(provider, message(cause)) }
        return note('Model key', [`Saved: ${service.maskedModelKey() ?? 'yes'}. Every app started from here gets it.`])
      },
    })
  }

  function ade() {
    menu('ade', 'ACRYL ADE: open it in', () => [
      { value: 'web', label: 'Browser', description: 'made once in your ACRYL home, then started; its address opens here', run: () => { attempt(() => { service.openAde('web'); home() }, home) } },
      { value: 'desktop', label: 'Window', description: 'ACRYL ADE in its own desktop window', run: () => { attempt(() => { service.openAde('desktop'); home() }, home) } },
      { value: 'tui', label: 'Terminal', description: 'the ACRYL coding agent in this terminal; closes the Control Center', run: () => close({ command: { program: 'acryl', args: ['ade', '--tui'], cwd: '.' }, line: 'acryl ade --tui' }) },
    ], { back: home })
  }

  function health() {
    busy('Health', 'Checking this computer...', () => service.health(), view => {
      const github = service.github()
      const yes = text => `${c('success')('✓')} ${text}`
      const no = text => `${c('warning')('!')} ${text}`
      note('Health', [
        view.node ? yes(`Node.js ${view.node}`) : no('Node.js was not found'),
        view.npm ? yes(`npm ${view.npm}`) : no('npm was not found'),
        view.modelKey ? yes('a model key is set') : no('no model key yet: Set up a model'),
        github.login ? yes(`GitHub: @${github.login}`) : no('GitHub is not connected'),
        c('muted')(`ACRYL home: ${view.home}`),
        c('muted')(`new apps go in: ${snapshot.appsFolder}`),
      ])
    })
  }

  function quit() {
    const running = snapshot.apps.filter(app => app.state === 'running' || app.state === 'starting')
    if (running.length === 0) return close(undefined)
    return show({ kind: 'confirm', title: 'Quit', lines: [`${running.map(app => app.name).join(', ')} ${running.length === 1 ? 'is' : 'are'} running from here and will stop.`], yes: 'Quit', back: home, onYes: () => close(undefined) })
  }

  // ---- refresh and drawing ---------------------------------------------------------------------------------------------------------------------

  /** Read the service again and rebuild the list when its rows changed, keeping the chosen row. The only place the list is made. */
  function refresh() {
    snapshot = service.state()
    for (const app of snapshot.apps) {
      if (app.address && opening.delete(app.id)) open(app.address)
      if (app.failure || app.state === 'missing') opening.delete(app.id)
    }
    if (screen?.kind !== 'menu') return
    const query = (screen.query ?? '').toLowerCase()
    const rows = screen.rows().filter(row => query === '' || `${row.label} ${row.description ?? ''} ${row.value}`.toLowerCase().includes(query))
    const key = JSON.stringify(rows.map(row => [row.value, row.label, row.description]))
    if (list && key === listKey) return
    const selected = list?.getSelectedItem()?.value
    list = new SelectList(rows, visibleRows(), listTheme)
    list.onSelect = item => rows.find(row => row.value === item.value)?.run()
    const index = rows.findIndex(row => row.value === selected)
    if (index > 0) list.setSelectedIndex(index)
    listKey = key
  }

  const fullHeader = width => width >= FULL_HEADER.width && rows() >= FULL_HEADER.rows
  const visibleRows = () => Math.max(4, Math.min(14, rows() - (rows() >= FULL_HEADER.rows ? MARK_ROWS.length + 14 : 14)))

  function header(width) {
    const options = { mode: theme.mode, color, shimmer: shimmerAt(tick) }
    // The running acryl's version, always in view: a stale npm cache or registry mirror shows at a glance.
    const line = version ? `${TAGLINE}  v${version}` : TAGLINE
    const tagline = color ? c('muted')(line) : line
    if (fullHeader(width)) {
      const center = text => ' '.repeat(Math.max(0, Math.floor((width - visibleWidth(text)) / 2))) + text
      return ['', ...markLines(width, options), '', center(wordmark(options)), center(tagline), '']
    }
    return [`${wordmark(options)}  ${tagline}`, '']
  }

  function job() {
    const at = snapshot.job
    if (!at) return []
    if (at.status === 'running') return [`${c('primary')(spinnerFrame(tick))} ${at.step}`, ...at.output.split('\n').filter(Boolean).slice(-2).map(line => c('muted')(`  ${line}`))]
    if (at.status === 'failed') return [`${c('error')('✕')} ${at.name}: ${(at.message ?? 'failed').split('\n').slice(-2).join(' ')}`]
    return [`${c('success')('✓')} ${at.step}`]
  }

  function body(width) {
    if (screen.kind === 'menu') {
      const detail = screen.detail?.() ?? []
      const filter = screen.filterable ? [c('muted')(screen.query ? `search: ${screen.query}` : 'type to search')] : []
      return [...filter, ...list.render(width), ...(detail.length > 0 ? ['', ...detail.flatMap(line => wrapTextWithAnsi(line, width))] : [])]
    }
    if (screen.kind === 'busy') return [`${c('primary')(spinnerFrame(tick))} ${screen.label}`]
    if (screen.kind === 'note') return screen.lines.flatMap(line => (line === '' ? [''] : wrapTextWithAnsi(line, width)))
    if (screen.kind === 'confirm') return [...screen.lines.flatMap(line => wrapTextWithAnsi(line, width)), '', `${c('primary')(bold(`Enter: ${screen.yes}`))}   ${c('muted')('Esc: back')}`]
    if (screen.kind === 'github') {
      return [
        'Open this page and enter the code:', '',
        `  ${c('primary')(bold(screen.uri))}`, '',
        `  ${gradient(screen.userCode.split('').join(' '), { mode: theme.mode, color, bold: true })}`, '',
        `${c('primary')(spinnerFrame(tick))} waiting for GitHub...`,
      ]
    }
    const value = screen.kind === 'secret' ? '•'.repeat([...screen.value].length) : screen.value
    const note = screen.error ? c('error')(screen.error) : c('muted')(screen.hint ?? '')
    return [c('primary')(screen.label), `${c('primary')('›')} ${value}${c('primary')('█')}`, note]
  }

  function keysHint() {
    switch (screen.kind) {
      case 'menu': return screen.filterable ? 'Up/Down choose   Enter open   type to search   Esc back' : `Up/Down choose   Enter open   ${screen.id === 'home' ? 'q quit' : 'Esc back'}   Ctrl-C quit`
      case 'ask': case 'secret': return 'Enter go on   Esc back   Ctrl-C quit'
      case 'confirm': return 'Enter yes   Esc back'
      case 'github': return 'Enter open the page in the browser   Esc stop waiting'
      case 'busy': return 'working...   Ctrl-C quit'
      default: return 'Enter or Esc back   Ctrl-C quit'
    }
  }

  // ---- keys --------------------------------------------------------------------------------------------------------------------------------------

  function back() {
    if (screen.kind === 'menu' && screen.id === 'home') return quit()
    polling = undefined
    return (screen.back ?? home)()
  }

  function typeInto(data) {
    const field = screen.kind === 'menu' ? 'query' : 'value'
    const text = screen[field] ?? ''
    // A paste arrives wrapped in bracketed-paste markers, and may end in a newline: the text between them is what was typed.
    // biome-ignore lint/suspicious/noControlCharactersInRegex: terminal escape sequences
    const typed = data.replace(/\x1b\[20[01]~/gu, '').replace(/[\r\n]+$/u, '')
    if (matchesKey(data, 'backspace')) screen = { ...screen, [field]: [...text].slice(0, -1).join('') }
    // biome-ignore lint/suspicious/noControlCharactersInRegex: terminal escape sequences
    else if (typed !== '' && !/[\x00-\x1f\x7f]/u.test(typed)) screen = { ...screen, [field]: text + typed }
    else return false
    if (field === 'query') { listKey = ''; refresh() }
    return true
  }

  home()

  return {
    /** Settles when the last action has finished (tests wait on it). */
    get settled() { return pending },
    get screen() { return screen },
    /** One animation step (run.js calls it every TICK_MS): the spinners and the title shimmer move, and the service's state is read again. */
    tick() {
      tick += 1
      refresh()
      requestRender()
    },
    render(width) {
      const out = [...header(width), sectionTitle(screen.title ?? '', width, { mode: theme.mode, color }), ...body(width)]
      const status = job()
      if (status.length > 0) out.push('', ...status)
      out.push('', color ? c('muted')(keysHint()) : keysHint())
      return out.map(line => truncateToWidth(line, width))
    },
    handleInput(data) {
      if (done) return
      if (matchesKey(data, 'ctrl+c')) return close(undefined)
      if (screen.kind === 'busy') return
      if (matchesKey(data, 'escape')) { back(); requestRender(); return }
      const enter = matchesKey(data, 'enter') || matchesKey(data, 'return')
      if (screen.kind === 'menu') {
        if (!screen.filterable && data === 'q' && screen.id === 'home') return quit()
        if (screen.filterable && !enter && !matchesKey(data, 'up') && !matchesKey(data, 'down') && typeInto(data)) { requestRender(); return }
        list?.handleInput(data)
      } else if (screen.kind === 'ask' || screen.kind === 'secret') {
        if (enter) screen.onSubmit(screen.value.trim())
        else typeInto(data)
      } else if (enter && screen.kind === 'confirm') screen.onYes()
      else if (enter && screen.kind === 'github') open(screen.uri)
      else if (enter && screen.kind === 'note') screen.back()
      requestRender()
    },
    invalidate() { list?.invalidate?.() },
  }
}

export { TICK_MS }
