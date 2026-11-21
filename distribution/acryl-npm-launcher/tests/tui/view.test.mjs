import assert from 'node:assert/strict'
import { test } from 'node:test'
import { visibleWidth } from '@earendil-works/pi-tui'
import { paletteTheme } from '@acryldev/ui-tui/scheme'
import { appRow, categoryLabel, createControlCenterView, storeShelves, webboxesBlendUrl } from '../../tui/view.js'

const KEY = { enter: '\r', down: '\x1b[B', up: '\x1b[A', esc: '\x1b', ctrlC: '\x03', backspace: '\x7f' }
// biome-ignore lint/suspicious/noControlCharactersInRegex: terminal escape sequences
const plain = lines => lines.join('\n').replace(/\x1b\[[0-9;]*m/gu, '')

const BLENDS = [
  { id: 'acrylblends.notes', name: 'Notes', version: '1.0.0', category: 'productivity', description: 'notes for a team', origin: 'official' },
  { id: 'acryl.control-center', name: 'ACRYL Control Center', version: '0.2.5', category: 'desktop', description: 'your apps', origin: 'official' },
  { id: 'someone.pomodoro', name: 'Pomodoro', version: '0.1.0', category: 'productivity › time', description: 'a timer', origin: 'community', source: 'github:someone/pomodoro#v0.1.0', publisher: 'someone' },
]

/** The service the window uses, as a recording double: every call is kept, state is what the test sets. */
function fakeService(state = {}) {
  const calls = []
  const current = { apps: [], appsFolder: '/home/me/ACRYL', starters: [{ value: 'blank', label: 'Blank', description: 'the smallest app' }], job: null, ...state }
  let login = null
  return {
    calls,
    current,
    state: () => current,
    github: () => ({ available: true, login }),
    githubStart: async () => { calls.push(['githubStart']); return { userCode: 'ABCD-1234', verificationUri: 'https://github.com/login/device', interval: 5 } },
    githubPoll: async () => { calls.push(['githubPoll']); login = 'octo'; return { state: 'connected', login } },
    githubDisconnect: () => { login = null },
    maskedModelKey: () => undefined,
    blends: async () => BLENDS,
    create: request => { calls.push(['create', request]); if (request.name === 'Bad') throw new Error('lower case letters, digits and dashes, starting with a letter') },
    start: (id, surface) => calls.push(['start', id, surface]),
    stop: id => calls.push(['stop', id]),
    update: id => calls.push(['update', id]),
    remove: id => calls.push(['remove', id]),
    add: path => calls.push(['add', path]),
    openAde: surface => calls.push(['openAde', surface]),
    health: async () => ({ node: '24.19.0', npm: '11.6.0', modelKey: false, home: '/home/me/.acryl' }),
    sharePlan: async request => { calls.push(['sharePlan', request]); return { repository: 'octo/shop', create: true, visibility: 'public', changes: 3 } },
    share: async request => { calls.push(['share', request]); return { remote: 'https://github.com/octo/shop', created: true } },
    plugins: async () => [{ name: 'cart', version: '0.1.0', state: 'active' }, { name: 'pulled', version: '1.0.0', state: 'active', pulledFrom: 'github:a/b@1.0.0' }],
    pullPlugin: async (id, source) => { calls.push(['pullPlugin', id, source]); return { text: `Pulled ${source}.`, plugins: [] } },
    publishPlan: async request => { calls.push(['publishPlan', request]); return { owner: 'octo', repo: 'cart', version: '0.1.0', visibility: 'public', license: 'MIT', createsRepository: true, files: ['a', 'b'], integrity: '', digest: '', pullLine: 'acryl plugin pull github:octo/cart@0.1.0' } },
    publish: async request => { calls.push(['publish', request.plugin]); return { releaseUrl: 'https://github.com/octo/cart/releases/tag/v0.1.0', pullLine: 'acryl plugin pull github:octo/cart@0.1.0' } },
  }
}

function open({ state, rows = 40, color = false, mode = 'dark', version } = {}) {
  const service = fakeService(state)
  const results = []
  const opened = []
  const saved = []
  const scheduled = []
  const view = createControlCenterView({
    service,
    model: { problem: key => (key.startsWith('sk-') ? undefined : 'a DeepSeek key starts with sk-'), save: (key, provider) => saved.push([key, provider]) },
    deployUrl: (github, name) => `https://webboxes.ai/dashboard/webboxes?github=${github}&name=${name}`,
    open: target => opened.push(target),
    theme: paletteTheme(mode),
    color,
    rows: () => rows,
    schedule: fn => scheduled.push(fn),
    finish: result => results.push(result),
    ...(version === undefined ? {} : { version }),
  })
  const press = async (...keys) => { for (const key of keys) { view.handleInput(key); await view.settled } }
  const pick = async label => {
    for (let i = 0; i < 40 && !selected(view).includes(label); i += 1) await press(KEY.down)
    assert.ok(selected(view).includes(label), `no row "${label}" on:\n${plain(view.render(80))}`)
    await press(KEY.enter)
  }
  return { view, service, results, opened, saved, scheduled, press, pick, screen: (width = 80) => plain(view.render(width)) }
}
const selected = view => plain(view.render(80)).split('\n').find(line => line.startsWith('→')) ?? ''

const shop = { id: 'shop', name: 'shop', path: '/home/me/ACRYL/shop', blend: 'acrylblends.blank', madeBy: 'person', surface: 'web', state: 'stopped' }

test('the home screen: the wordmark, the tagline, the actions, and the keys, inside 80 columns', () => {
  const { screen, view } = open()
  const text = screen()
  for (const words of ['ACRYL', 'Control Center', 'Everything is a plugin. Build agentic apps.', 'NO APPS YET', '+ New app', 'Blends store', 'Connect GitHub', 'Set up a model', 'ACRYL ADE', 'Health', 'q quit']) assert.match(text, new RegExp(words.replace(/[.+]/gu, '\\$&'), 'u'))
  for (const width of [40, 80, 120]) for (const line of view.render(width)) assert.ok(visibleWidth(line) <= width, `wider than ${width}: ${line}`)
})

test('a tall terminal shows the full mark; a short one the one-line wordmark', () => {
  assert.match(open({ rows: 40 }).screen(), /▄█▀█▄/u)
  assert.doesNotMatch(open({ rows: 24 }).screen(), /▄█▀█▄/u)
  assert.doesNotMatch(open({ rows: 40 }).screen(50), /▄█▀█▄/u)
})

test('NO_COLOR draws no escape codes for color; with color the title is a gradient of many colors', () => {
  const none = open({ color: false }).view.render(80).join('\n')
  // biome-ignore lint/suspicious/noControlCharactersInRegex: terminal escape sequences
  assert.doesNotMatch(none, /\x1b\[38;2/u)
  const colored = open({ color: true }).view.render(80).join('\n')
  // biome-ignore lint/suspicious/noControlCharactersInRegex: terminal escape sequences
  assert.ok(new Set(colored.match(/\x1b\[38;2;[0-9;]+m/gu)).size > 20)
})

test('an app: start in the browser, its address opens once it is up, then stop', async () => {
  const { press, pick, service, opened, screen, view } = open({ state: { apps: [{ ...shop }] } })
  assert.match(screen(), /○ shop .*stopped {2}Web {2}acrylblends\.blank/u)
  await press(KEY.enter)
  assert.match(screen(), /SHOP/u)
  await pick('Start in the browser')
  assert.deepEqual(service.calls.at(-1), ['start', 'shop', 'web'])
  service.current.apps = [{ ...shop, state: 'running', address: 'http://127.0.0.1:3999/?token=t' }]
  view.tick()
  assert.deepEqual(opened, ['http://127.0.0.1:3999/?token=t'])
  view.tick()
  assert.equal(opened.length, 1, 'the address opens once')
  await pick('Stop')
  assert.deepEqual(service.calls.at(-1), ['stop', 'shop'])
})

test('share an app to GitHub: public, the plan, yes; then Deploy opens WebBoxes.ai with the repository', async () => {
  const { pick, press, service, opened, screen } = open({ state: { apps: [{ ...shop }] } })
  await press(KEY.enter)
  await pick('Share to GitHub')
  await pick('Public')
  assert.match(screen(), /Repository: octo\/shop \(new\)/u)
  assert.match(screen(), /Blends store lists it/u)
  await press(KEY.enter)
  assert.deepEqual(service.calls.at(-1)[0], 'share')
  assert.match(screen(), /Made and pushed: https:\/\/github\.com\/octo\/shop/u)
  service.current.apps = [{ ...shop, github: 'https://github.com/octo/shop' }]
  await press(KEY.enter)
  await pick('Deploy to WebBoxes.ai')
  assert.deepEqual(opened, ['https://webboxes.ai/dashboard/webboxes?github=https://github.com/octo/shop&name=shop'])
})

test('pull and publish a plugin through the app', async () => {
  const { pick, press, service, screen } = open({ state: { apps: [{ ...shop, state: 'running' }] } })
  await press(KEY.enter)
  await pick('Pull a plugin')
  await press(...'github:a/b@1.0.0'.split(''), KEY.enter)
  assert.deepEqual(service.calls.at(-1), ['pullPlugin', 'shop', 'github:a/b@1.0.0'])
  await press(KEY.enter)
  await pick('Publish a plugin')
  assert.doesNotMatch(screen(), /pulled/u, 'only the app\'s own plugins are offered')
  await pick('cart')
  assert.match(screen(), /To: octo\/cart \(new repository\)/u)
  await press(KEY.enter)
  assert.match(screen(), /acryl plugin pull github:octo\/cart@0\.1\.0/u)
})

test('the store: shelves by origin and category, search, a Blend made with the name its id gives', async () => {
  const { pick, press, service, screen } = open()
  await pick('Blends store')
  assert.match(screen(), /All Blends \(3\)/u)
  assert.match(screen(), /Official \(2\)/u)
  assert.match(screen(), /Community \(1\)/u)
  assert.match(screen(), /Productivity \(2\)/u)
  await press(KEY.enter)
  await press(...'pomo'.split(''))
  assert.match(screen(), /search: pomo/u)
  assert.match(screen(), /Pomodoro/u)
  assert.doesNotMatch(screen(), /Notes/u)
  await press(KEY.enter)
  assert.match(screen(), /not\s+reviewed/u)
  await pick('Make it: Desktop')
  assert.match(screen(), /pomodoro/u)
  await press(KEY.enter)
  assert.deepEqual(service.calls.at(-1), ['create', { where: '/home/me/ACRYL', name: 'pomodoro', blend: 'github:someone/pomodoro#v0.1.0', surface: 'desktop' }])
  assert.match(screen(), /NO APPS YET/u)
})

test('a new app: a refused name stays on the question with the reason', async () => {
  const { pick, press, service, screen } = open()
  await pick('+ New app')
  await press(KEY.enter) // Blank
  await press(KEY.enter) // Web
  await press(...Array(6).fill(KEY.backspace), ...'Bad'.split(''), KEY.enter)
  assert.match(screen(), /lower case letters, digits and dashes, starting with a letter/u)
  await press(...Array(3).fill(KEY.backspace), ...'shop'.split(''), KEY.enter)
  assert.deepEqual(service.calls.at(-1), ['create', { where: '/home/me/ACRYL', name: 'shop', starter: 'blank', surface: 'web' }])
})

test('GitHub sign-in shows the device code and finishes when GitHub says connected', async () => {
  const { pick, press, scheduled, opened, screen } = open()
  await pick('Connect GitHub')
  assert.match(screen(), /A B C D - 1 2 3 4/u)
  assert.match(screen(), /https:\/\/github\.com\/login\/device/u)
  await press(KEY.enter)
  assert.deepEqual(opened, ['https://github.com/login/device'])
  await scheduled.at(-1)()
  assert.match(screen(), /Connected as @octo/u)
})

test('the model key is never drawn, a wrong one is refused, a right one saved', async () => {
  const { pick, press, saved, screen } = open()
  await pick('Set up a model')
  await press(KEY.enter) // DeepSeek
  await press(...'nope'.split(''), KEY.enter)
  assert.match(screen(), /starts with sk-/u)
  await press(...Array(4).fill(KEY.backspace), '\x1b[200~sk-secret-123\x1b[201~')
  assert.doesNotMatch(screen(), /secret/u)
  assert.match(screen(), /•{13}/u)
  await press(KEY.enter)
  assert.deepEqual(saved, [['sk-secret-123', 'deepseek']])
})

test('ACRYL ADE: browser and window run in the service; the terminal agent closes the screen and is handed back to run', async () => {
  const { pick, press, service, results } = open()
  await pick('ACRYL ADE')
  await pick('Browser')
  assert.deepEqual(service.calls.at(-1), ['openAde', 'web'])
  await pick('ACRYL ADE')
  await pick('Terminal')
  assert.deepEqual(results, [{ command: { program: 'acryl', args: ['ade', '--tui'], cwd: '.' }, line: 'acryl ade --tui' }])
  await press(KEY.enter)
  assert.equal(results.length, 1, 'finish is called once')
})

test('quitting with running apps asks first; Ctrl-C quits at once', async () => {
  const first = open({ state: { apps: [{ ...shop, state: 'running' }] } })
  await first.press('q')
  assert.match(first.screen(), /shop is running from here and will stop/u)
  await first.press(KEY.enter)
  assert.deepEqual(first.results, [undefined])
  const second = open()
  await second.press(KEY.ctrlC)
  assert.deepEqual(second.results, [undefined])
})

test('pure helpers: the app row, the shelves and the WebBoxes link of a store Blend', () => {
  assert.deepEqual(appRow({ ...shop, state: 'starting', update: '1.1.0' }, 0), { value: 'app:shop', label: '⠋ shop', description: 'starting  Web  acrylblends.blank  update 1.1.0' })
  assert.deepEqual(storeShelves(BLENDS).map(shelf => shelf.label), ['All Blends (3)', 'Official (2)', 'Community (1)', 'Desktop (1)', 'Productivity (2)'])
  assert.equal(webboxesBlendUrl('acryl.control-center'), 'https://webboxes.ai/dashboard/webboxes?blend=acryl.control-center')
  assert.equal(categoryLabel('api-sdk'), 'API SDK')
  assert.equal(categoryLabel('aerospace-aviation'), 'Aerospace aviation')
  assert.equal(storeShelves([{ category: 'application' }, { category: 'Application › Notes' }]).at(-1).label, 'Application (2)')
})

test('the header always shows the running acryl version, so a stale cache or mirror shows at a glance', () => {
  const { screen, view } = open({ version: '0.3.2' })
  assert.match(screen(), /Everything is a plugin\. Build agentic apps\.\s+v0\.3\.2/)
  for (const width of [40, 80, 120]) for (const line of view.render(width)) assert.ok(visibleWidth(line) <= width, `wider than ${width}: ${line}`)
})
