import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { addApp, addToApplications, desktopExecArg, runAppsCommand, isLauncherHome, launcherPlan, offeredLauncher, readLaunchers, recordOffer, refreshLaunchers, removeFromApplications } from '../index.js'

const SOURCE = fileURLToPath(new URL('..', import.meta.url))

/** A person's home with `.acryl` in it, an app with a blend.yaml, and a recording `exec` instead of sips, codesign and PowerShell. */
function scratch(run) {
  const root = mkdtempSync(join(tmpdir(), 'acryl-launchers-'))
  try {
    const user = join(root, 'user')
    const home = join(user, '.acryl')
    const folder = join(root, 'apps', 'shop')
    mkdirSync(folder, { recursive: true })
    mkdirSync(home, { recursive: true })
    writeFileSync(join(folder, 'blend.yaml'), 'apiVersion: x\nmetadata:\n  id: acrylblends.shop\n  name: My Shop\n')
    const calls = []
    const exec = (command, args, env) => {
      calls.push({ command, args, env })
      if (command === 'sips') writeFileSync(args[args.indexOf('--out') + 1], 'picture')   // what sips leaves behind
      return { status: 0, stderr: '' }
    }
    return run({ root, user, home, folder, calls, exec })
  } finally { rmSync(root, { recursive: true, force: true }) }
}
// These write a Linux or macOS launcher into a real scratch folder: on a Windows runner that folder is a Windows path, which the posix rules of the
// simulated OS cannot read. The Windows launcher has its own tests above and was walked on Windows 10.
const POSIX_HOME = { skip: process.platform === 'win32' && 'a simulated Linux or macOS home needs a posix scratch path' }
const app = folder => ({ id: 'shop', name: 'My Shop', folder })
const OS_ID = 'com.acrylblends.app.shop-ab12'

test('what each OS writes, as data', () => {
  const folder = '/work/shop'
  const mac = launcherPlan({ platform: 'darwin', home: '/Users/a/.acryl', node: '/opt/node/bin/node', app: app(folder), icon: '/work/shop/assets/icon.png' })
  assert.deepEqual(mac.files.map(file => file.path), ['/Users/a/Applications/My Shop.app/Contents/Info.plist', '/Users/a/Applications/My Shop.app/Contents/MacOS/launch'])
  assert.match(mac.files[0].content, /<key>CFBundleIdentifier<\/key><string>io\.github\.acrylblends\.shop<\/string>/u)
  assert.match(mac.files[0].content, /<key>LSUIElement<\/key><true\/>/u)
  assert.equal(mac.files[1].mode, 0o755)
  assert.equal(mac.files[1].content, "#!/bin/sh\nexec '/opt/node/bin/node' '/Users/a/.acryl/shortcuts/shortcut-open.mjs' '/work/shop'\n")
  assert.deepEqual(mac.icon, { kind: 'icns', from: '/work/shop/assets/icon.png', to: '/Users/a/Applications/My Shop.app/Contents/Resources/icon.icns' })
  assert.equal(mac.sign, '/Users/a/Applications/My Shop.app')
  assert.deepEqual(mac.record, ['/Users/a/Applications/My Shop.app', '/Users/a/.acryl/shortcuts'])

  const win = launcherPlan({ platform: 'win32', home: 'C:\\Users\\a\\.acryl', node: 'C:\\node\\node.exe', app: app('D:\\apps\\shop'), icon: 'D:\\apps\\shop\\assets\\icon.png' })
  assert.equal(win.lnk.path, 'C:\\Users\\a\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\ACRYL\\My Shop.lnk')
  assert.equal(win.lnk.target, 'wscript.exe')
  assert.equal(win.lnk.args, '"C:\\Users\\a\\.acryl\\launchers\\shop\\shop.vbs"')
  assert.equal(win.files[0].content, 'CreateObject("WScript.Shell").Run """C:\\node\\node.exe"" ""C:\\Users\\a\\.acryl\\shortcuts\\shortcut-open.mjs"" ""D:\\apps\\shop""", 0, False\r\n')
  assert.deepEqual(win.icon, { kind: 'ico', from: 'D:\\apps\\shop\\assets\\icon.png', to: 'C:\\Users\\a\\.acryl\\launchers\\shop\\shop.ico' })

  const linux = launcherPlan({ platform: 'linux', home: '/home/a/.acryl', node: '/usr/bin/node', app: app(folder), icon: '/work/shop/assets/icon.png' })
  assert.equal(linux.files[0].path, '/home/a/.local/share/applications/acryl-shop.desktop')
  assert.equal(linux.files[0].content, '[Desktop Entry]\nType=Application\nName=My Shop\nExec="/usr/bin/node" "/home/a/.acryl/shortcuts/shortcut-open.mjs" "/work/shop"\nIcon=/home/a/.local/share/icons/acryl-shop.png\nTerminal=false\nCategories=Utility;\nX-ACRYL-App=shop\n')
  assert.deepEqual(linux.icon, { kind: 'png', from: '/work/shop/assets/icon.png', to: '/home/a/.local/share/icons/acryl-shop.png' })
  assert.deepEqual(linux.record, ['/home/a/.local/share/applications/acryl-shop.desktop', '/home/a/.local/share/icons/acryl-shop.png', '/home/a/.acryl/shortcuts'])
})

test('with the app\'s OS id (T056), the Start shortcut carries it as its AppUserModelID and the .desktop names it as StartupWMClass; macOS is unchanged (the running clone carries it)', () => {
  const withId = folder => ({ ...app(folder), osId: OS_ID })
  const win = launcherPlan({ platform: 'win32', home: 'C:\\Users\\a\\.acryl', node: 'C:\\node\\node.exe', app: withId('D:\\apps\\shop') })
  assert.equal(win.lnk.appUserModelId, OS_ID)
  const linux = launcherPlan({ platform: 'linux', home: '/home/a/.acryl', node: '/usr/bin/node', app: withId('/work/shop') })
  assert.equal(linux.files[0].content, '[Desktop Entry]\nType=Application\nName=My Shop\nExec="/usr/bin/node" "/home/a/.acryl/shortcuts/shortcut-open.mjs" "/work/shop"\nTerminal=false\nCategories=Utility;\nStartupWMClass=com.acrylblends.app.shop-ab12\nX-ACRYL-App=shop\n')
  const mac = launcherPlan({ platform: 'darwin', home: '/Users/a/.acryl', node: '/opt/node/bin/node', app: withId('/work/shop') })
  assert.deepEqual(mac, launcherPlan({ platform: 'darwin', home: '/Users/a/.acryl', node: '/opt/node/bin/node', app: app('/work/shop') }))
})

test('the managed copies show their product name to the opener; an app without an icon has no icon line', () => {
  const plan = launcherPlan({ platform: 'linux', home: '/home/a/.acryl', node: '/usr/bin/node', app: { id: 'control-center', name: 'ACRYL Control Center', folder: '/home/a/.acryl/control-center', forwardName: true } })
  assert.match(plan.files[0].content, /\/home\/a\/\.acryl\/control-center" "ACRYL Control Center"\n/u)
  assert.doesNotMatch(plan.files[0].content, /Icon=/u)
})

test('Exec is quoted by the freedesktop rules', () => {
  assert.equal(desktopExecArg('/a b/c'), '"/a b/c"')
  assert.equal(desktopExecArg('say "hi"'), '"say \\\\"hi\\\\""')
  assert.equal(desktopExecArg('$HOME `x`'), '"\\\\$HOME \\\\`x\\\\`"')
  assert.equal(desktopExecArg('50%'), '"50%%"')
  assert.equal(desktopExecArg('a\\b'), '"a\\\\\\\\b"', 'a literal backslash is four in the file')
})

test('nothing is written for a home that is not .acryl', () => scratch(({ root, folder, exec }) => {
  const dev = join(root, 'user', '.acryl-dev')
  mkdirSync(dev, { recursive: true })
  assert.equal(isLauncherHome(dev), false)
  assert.equal(isLauncherHome(join(root, 'user', '.acryl')), true)
  assert.throws(() => addToApplications({ home: dev, node: process.execPath, app: app(folder), sourceDir: SOURCE, exec }), /only for the \.acryl folder/u)
  assert.deepEqual(refreshLaunchers({ home: dev, node: process.execPath }), [])
  assert.deepEqual(readdirSync(dev), [])
}))

for (const platform of ['linux', 'darwin']) {
  if (platform !== process.platform && !(platform === 'linux' && process.platform === 'darwin')) continue
  test(`add writes the launcher and the record, a second add changes nothing, remove deletes exactly that (${platform})`, () => scratch(({ user, home, folder, calls, exec }) => {
    mkdirSync(join(folder, 'assets'), { recursive: true })
    writeFileSync(join(folder, 'assets', 'icon.png'), 'png')
    addApp(home, { path: folder, surface: 'desktop' })
    const node = '/usr/local/bin/node'
    const launcher = platform === 'darwin' ? join(user, 'Applications', 'My Shop.app') : join(user, '.local', 'share', 'applications', 'acryl-shop.desktop')
    const result = addToApplications({ platform, home, node, app: 'shop', sourceDir: SOURCE, exec })
    assert.deepEqual(result.problems, [])
    assert.ok(existsSync(launcher))
    assert.ok(existsSync(join(home, 'shortcuts', 'shortcut-open.mjs')) && existsSync(join(home, 'shortcuts', 'model-key.js')), 'the opener and what it imports are copied')
    assert.deepEqual(readLaunchers(home, platform).apps.shop.files, result.written)
    if (platform === 'linux') {
      assert.equal(readFileSync(join(user, '.local', 'share', 'icons', 'acryl-shop.png'), 'utf8'), 'png')
      assert.equal(statSync(launcher).isFile(), true)
      // The app's own id (its .acryl/app.json, the one the running app reads) names the window class the menu entry matches.
      const { id } = JSON.parse(readFileSync(join(folder, '.acryl', 'app.json'), 'utf8'))
      assert.match(readFileSync(launcher, 'utf8'), new RegExp(`^StartupWMClass=com\\.acrylblends\\.app\\.${id}$`, 'mu'))
    } else {
      assert.deepEqual(calls.map(call => call.command), ['sips', 'sips', 'codesign'])
      assert.equal(statSync(join(launcher, 'Contents', 'MacOS', 'launch')).mode & 0o111, 0o111)
    }
    const stamp = statSync(launcher).mtimeMs
    const before = calls.length
    addToApplications({ platform, home, node, app: 'shop', sourceDir: SOURCE, exec })
    assert.equal(calls.length, before, 'nothing is converted or signed again when nothing changed')
    assert.equal(statSync(launcher).mtimeMs, stamp)
    assert.equal(removeFromApplications({ platform, home, id: 'shop' }), true)
    assert.equal(existsSync(launcher), false)
    assert.deepEqual(readdirSync(home).filter(name => name !== 'control-center-apps.json'), [], 'no opener, no record left')
    assert.equal(existsSync(join(user, '.local', 'share', 'icons', 'acryl-shop.png')), false)
    assert.equal(removeFromApplications({ platform, home, id: 'shop' }), false)
  }))
}

test('a moved Node.js rewrites the launcher; a renamed app does not leave the old one', POSIX_HOME, () => scratch(({ user, home, folder, exec }) => {
  addApp(home, { path: folder, surface: 'desktop' })
  const file = join(user, '.local', 'share', 'applications', 'acryl-shop.desktop')
  addToApplications({ platform: 'linux', home, node: '/old/node', app: 'shop', sourceDir: SOURCE, exec })
  assert.match(readFileSync(file, 'utf8'), /"\/old\/node"/u)
  assert.deepEqual(refreshLaunchers({ platform: 'linux', home, node: '/old/node', sourceDir: SOURCE, exec }), [], 'unchanged: nothing rewritten')
  assert.deepEqual(refreshLaunchers({ platform: 'linux', home, node: '/new/node', sourceDir: SOURCE, exec }), ['shop'])
  assert.match(readFileSync(file, 'utf8'), /"\/new\/node"/u)
  writeFileSync(join(folder, 'blend.yaml'), 'metadata:\n  id: acrylblends.shop\n  name: Shop Two\n')
  addToApplications({ platform: 'linux', home, node: '/new/node', app: 'shop', sourceDir: SOURCE, exec })
  assert.match(readFileSync(file, 'utf8'), /Name=Shop Two/u)
}))

test('the answer to the one-time offer is kept; removing the last launcher keeps it', POSIX_HOME, () => scratch(({ home, folder, exec }) => {
  assert.equal(offeredLauncher(home), undefined)
  recordOffer(home, 'no')
  assert.equal(offeredLauncher(home), 'no')
  addApp(home, { path: folder, surface: 'desktop' })
  addToApplications({ platform: 'linux', home, node: '/n', app: 'shop', sourceDir: SOURCE, exec })
  removeFromApplications({ platform: 'linux', home, id: 'shop' })
  assert.equal(offeredLauncher(home), 'no')
}))

test('the Windows script path is run through PowerShell with the values in the environment', () => {
  // The .lnk is made by one PowerShell call whose inputs are environment variables, so a name with quotes or a dollar sign cannot change the script.
  const plan = launcherPlan({ platform: 'win32', home: 'C:\\Users\\a\\.acryl', node: 'C:\\n\\node.exe', app: { id: 'x', name: 'A "b" $c', folder: 'D:\\x' } })
  assert.equal(plan.lnk.path.endsWith('\\ACRYL\\A -b- $c.lnk'), true)
})

test('acryl apps add-to-applications and remove-from-applications are the same actions as the screen\'s buttons', POSIX_HOME, () => scratch(({ user, home, folder, exec }) => {
  addApp(home, { path: folder, surface: 'desktop' })
  const out = []
  const err = []
  const common = { home, cwd: user, platform: 'linux', node: '/usr/bin/node', out: line => out.push(line), err: line => err.push(line) }
  assert.equal(runAppsCommand(['add-to-applications', 'nope'], common), 1)
  assert.match(err.pop(), /no app "nope" in the list/u)
  assert.equal(runAppsCommand(['add-to-applications'], common), 2)
  assert.equal(runAppsCommand(['add-to-applications', 'shop'], common), 0)
  assert.ok(existsSync(join(user, '.local', 'share', 'applications', 'acryl-shop.desktop')))
  runAppsCommand(['list'], common)
  assert.match(out.at(-1), /\(in Applications\)$/u)
  assert.equal(runAppsCommand(['remove-from-applications', 'shop'], common), 0)
  assert.equal(runAppsCommand(['remove-from-applications', 'shop'], common), 1)
  assert.equal(existsSync(join(user, '.local', 'share', 'applications', 'acryl-shop.desktop')), false)
  void exec
}))

test('the PowerShell script holds no backslash (a JavaScript template eats one: the shortcut once pointed at C:\\Windows\\System32wscript.exe)', async () => {
  const { WINDOWS_SCRIPT } = await import('../os-launchers.js')
  assert.equal(WINDOWS_SCRIPT.includes('\\'), false)
})

test('the call Fork3 makes: an app object with its own icon in, an app object with an id out', POSIX_HOME, () => scratch(({ user, home, folder, exec }) => {
  writeFileSync(join(folder, 'own.png'), 'png')
  const result = addToApplications({ platform: 'linux', home, node: '/usr/bin/node', app: { id: 'aos', name: 'ACRYL AOS', folder, icon: join(folder, 'own.png') }, sourceDir: SOURCE, exec })
  assert.ok(result.written.includes(join(user, '.local', 'share', 'applications', 'acryl-aos.desktop')))
  assert.equal(readFileSync(join(user, '.local', 'share', 'icons', 'acryl-aos.png'), 'utf8'), 'png')
  assert.equal(removeFromApplications({ platform: 'linux', home, app: { id: 'aos' } }), true)
  assert.equal(existsSync(join(user, '.local', 'share', 'applications', 'acryl-aos.desktop')), false)
}))
