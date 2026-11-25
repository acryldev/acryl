// Installing an app against the shared Program (spec 052 Step 1, specs/052-acryl-app-os/baseline.md findings 1-3). npm is a fake that writes what a
// real install writes (package folders, node_modules/.package-lock.json last), so every rule here runs in milliseconds on any OS.
import assert from 'node:assert/strict'
import { appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { installApp, programOf, sealProgram } from '../app-install.js'
import { fakeNpm } from './fake-npm.mjs'

function scratch(run) {
  const root = mkdtempSync(join(tmpdir(), 'acryl-install-'))
  return Promise.resolve(run(root)).finally(() => rmSync(root, { recursive: true, force: true }))
}

const blendsApp = (root, name, deps = { '@acryldev/blends': '^1.7.33', 'left-pad': '1.3.0' }) => {
  const folder = join(root, name)
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, 'package.json'), JSON.stringify({ name, dependencies: deps }))
  return folder
}

const inode = path => statSync(path).ino
const linux = { platform: 'linux' }

test('characterization: an app npm installed before (today\'s layout) gets npm install on top, nothing else', () => scratch(async root => {
  const home = join(root, 'home')
  const folder = blendsApp(root, 'old')
  const first = fakeNpm()
  await first.npm(['install'], folder)
  const before = inode(join(folder, 'node_modules', 'left-pad', 'index.js'))
  const { npm, calls } = fakeNpm()
  const result = await installApp({ folder, home, npm, ...linux })
  assert.equal(result.code, 0)
  assert.equal(result.program, 'none')
  assert.deepEqual(calls.map(call => [call.args.join(' '), call.cwd]), [['install --no-audit --no-fund', folder]])
  assert.equal(inode(join(folder, 'node_modules', 'left-pad', 'index.js')), before, 'its files are the same files')
  assert.equal(existsSync(join(home, 'program')), false, 'an existing install does not make a Program')
}))

test('characterization: an app without @acryldev/blends installs as today, with the npm arguments its caller gives', () => scratch(async root => {
  const home = join(root, 'home')
  const folder = blendsApp(root, 'plain', { 'left-pad': '1.3.0' })
  const { npm, calls } = fakeNpm()
  const result = await installApp({ folder, home, npm, npmArgs: ['install', '--loglevel', 'http'], ...linux })
  assert.equal(result.program, 'none')
  assert.deepEqual(calls[0].args, ['install', '--loglevel', 'http'])
  assert.equal(existsSync(join(folder, 'node_modules', 'left-pad', 'index.js')), true)
  assert.equal(existsSync(join(home, 'program')), false)
}))

test('the Program is named by the Blends version an app asks for; none for a range it cannot read', () => scratch(root => {
  assert.equal(programOf(blendsApp(root, 'a')), 'blends-1.7.33')
  assert.equal(programOf(blendsApp(root, 'b', { '@acryldev/blends': '~2.0.1' })), 'blends-2.0.1')
  assert.equal(programOf(blendsApp(root, 'c', { '@acryldev/blends': 'latest' })), undefined)
  assert.equal(programOf(blendsApp(root, 'd', { '@acryldev/blends': 'file:../blends' })), undefined)
  assert.equal(programOf(join(root, 'missing')), undefined)
}))

test('the first app installs as today and its install becomes the Program; the second starts from it and adds only its own', () => scratch(async root => {
  const home = join(root, 'home')
  const first = blendsApp(root, 'first')
  const one = fakeNpm()
  const made = await installApp({ folder: first, home, npm: one.npm, ...linux })
  assert.equal(made.code, 0)
  assert.equal(made.program, 'made')
  assert.equal(one.calls[0].found, false, 'the first app had nothing before npm')
  const program = join(home, 'program', 'blends-1.7.33')
  assert.equal(existsSync(join(program, 'node_modules', 'left-pad', 'index.js')), true)
  assert.equal(existsSync(join(program, 'sha256.json')), true)

  const second = blendsApp(root, 'second', { '@acryldev/blends': '^1.7.33', 'left-pad': '1.3.0', 'is-odd': '3.0.1' })
  const two = fakeNpm()
  const used = await installApp({ folder: second, home, npm: two.npm, ...linux })
  assert.equal(used.code, 0)
  assert.equal(used.program, 'used')
  assert.equal(two.calls[0].found, true, 'npm found the Program\'s packages already in place')
  assert.equal(inode(join(second, 'node_modules', 'left-pad', 'index.js')), inode(join(program, 'node_modules', 'left-pad', 'index.js')), 'one file, linked')
  assert.equal(existsSync(join(second, 'node_modules', 'is-odd', 'index.js')), true, 'its own package added on top')
  assert.equal(existsSync(join(program, 'node_modules', 'is-odd')), false, 'and not into the Program')
}))

test('each app gets its own hidden lockfile, stamped now, so npm neither writes into the Program nor re-extracts it (findings 1 and 2)', () => scratch(async root => {
  const home = join(root, 'home')
  await installApp({ folder: blendsApp(root, 'first'), home, npm: fakeNpm().npm, ...linux })
  const program = join(home, 'program', 'blends-1.7.33')
  const lock = join(program, 'node_modules', '.package-lock.json')
  const old = new Date(Date.now() - 3_600_000)
  utimesSync(lock, old, old)
  const programLock = readFileSync(lock, 'utf8')

  const second = blendsApp(root, 'second')
  let seen
  const { npm } = fakeNpm()
  const watching = async (args, cwd) => { seen = statSync(join(cwd, 'node_modules', '.package-lock.json')); return npm(args, cwd) }
  const result = await installApp({ folder: second, home, npm: watching, ...linux })
  assert.equal(result.program, 'used')
  assert.notEqual(seen.ino, inode(lock), 'a copy, not a link')
  assert.ok(seen.mtimeMs > old.getTime() + 60_000, 'stamped now, newer than every package folder')
  assert.equal(readFileSync(lock, 'utf8'), programLock, 'npm\'s rewrite stayed in the app')
}))

test('an install that writes into a Program file through its link is caught by the sha256 check and the Program is retired', () => scratch(async root => {
  const home = join(root, 'home')
  await installApp({ folder: blendsApp(root, 'first'), home, npm: fakeNpm().npm, ...linux })
  const program = join(home, 'program', 'blends-1.7.33')
  // A writer that makes the read-only file writable first (as a Windows remover may): the sha256 check stays the last guard.
  const bad = fakeNpm({
    alsoWrite: (cwd) => {
      const file = join(cwd, 'node_modules', 'left-pad', 'index.js')
      chmodSync(file, 0o644)
      appendFileSync(file, '// patched in place\n')
    },
  })
  const lines = []
  const result = await installApp({ folder: blendsApp(root, 'second'), home, npm: bad.npm, say: line => lines.push(line), ...linux })
  assert.equal(result.code, 0, 'the app itself installed')
  assert.equal(result.program, 'retired')
  assert.equal(existsSync(program), false, 'the next app makes a new Program instead of sharing a changed one')
  assert.match(lines.join('\n'), /changed 1 file of the shared Program \(node_modules\/left-pad\/index\.js\)/u)
}))

test('a failed install keeps npm\'s exit code and makes no Program', () => scratch(async root => {
  const home = join(root, 'home')
  const result = await installApp({ folder: blendsApp(root, 'first'), home, npm: fakeNpm({ code: 7 }).npm, ...linux })
  assert.equal(result.code, 7)
  assert.equal(existsSync(join(home, 'program', 'blends-1.7.33')), false)
}))

test('an app on another disk than the home installs as today, and says why', () => scratch(async root => {
  const home = join(root, 'home')
  await installApp({ folder: blendsApp(root, 'first'), home, npm: fakeNpm().npm, ...linux })
  const folder = blendsApp(root, 'elsewhere')
  const lines = []
  const { npm, calls } = fakeNpm()
  const device = path => (path.startsWith(folder) ? 2 : 1)
  const result = await installApp({ folder, home, npm, say: line => lines.push(line), device, ...linux })
  assert.equal(result.program, 'none')
  assert.equal(calls[0].found, false)
  assert.match(lines.join('\n'), /another disk/u)
}))

test('Electron is unpacked before the Program is made, so every app shares one binary, and path.txt names it (Electron writes it only when it downloads)', () => scratch(async root => {
  const home = join(root, 'home')
  const folder = blendsApp(root, 'desktop', { '@acryldev/blends': '^1.7.33', electron: '44.9.3' })
  // A stand-in for electron's index.js: the first require unpacks dist, as Electron 44's does, but leaves no path.txt (the override case).
  const electronIndex = "const fs=require('fs'),p=require('path');const d=p.join(__dirname,'dist');if(!fs.existsSync(d)){fs.mkdirSync(d);fs.writeFileSync(p.join(d,'electron'),'bin')}module.exports=p.join(d,'electron')\n"
  const { npm } = fakeNpm({ alsoWrite: cwd => writeFileSync(join(cwd, 'node_modules', 'electron', 'index.js'), electronIndex) })
  const withPackage = async (args, cwd) => {
    const code = await npm(args, cwd)
    writeFileSync(join(cwd, 'node_modules', 'electron', 'package.json'), '{"name":"electron","main":"index.js"}')
    return code
  }
  const result = await installApp({ folder, home, npm: withPackage, ...linux })
  assert.equal(result.program, 'made')
  const program = join(home, 'program', 'blends-1.7.33', 'node_modules', 'electron')
  assert.equal(existsSync(join(program, 'dist', 'electron')), true, 'the Program carries the unpacked binary')
  assert.equal(readFileSync(join(program, 'path.txt'), 'utf8'), 'electron')
}))

test('on macOS the Program is an APFS clone (cp -c), never a hard link', { skip: process.platform !== 'darwin' }, () => scratch(async root => {
  const home = join(root, 'home')
  await installApp({ folder: blendsApp(root, 'first'), home, npm: fakeNpm().npm })
  const second = blendsApp(root, 'second')
  const result = await installApp({ folder: second, home, npm: fakeNpm({ alsoWrite: cwd => appendFileSync(join(cwd, 'node_modules', 'left-pad', 'index.js'), '// x\n') }).npm })
  assert.equal(result.program, 'used', 'a write into a clone stays in the app')
  assert.notEqual(inode(join(second, 'node_modules', 'left-pad', 'index.js')), inode(join(home, 'program', 'blends-1.7.33', 'node_modules', 'left-pad', 'index.js')))
}))

const writableBits = path => statSync(path).mode & 0o222

test('the Program is read-only (spec 052 D18): an edit in place through an app\'s link fails, the app\'s own lockfile and new packages stay writable', () => scratch(async root => {
  const home = join(root, 'home')
  const first = blendsApp(root, 'first')
  await installApp({ folder: first, home, npm: fakeNpm().npm, ...linux })
  const program = join(home, 'program', 'blends-1.7.33')
  const shared = join(program, 'node_modules', 'left-pad', 'index.js')
  assert.equal(writableBits(shared), 0, 'the shared file is read-only')
  assert.equal(writableBits(join(first, 'node_modules', '.package-lock.json')) !== 0, true, 'the first app\'s lockfile is its own, writable')

  const second = blendsApp(root, 'second', { '@acryldev/blends': '^1.7.33', 'left-pad': '1.3.0', 'is-odd': '3.0.1' })
  const used = await installApp({ folder: second, home, npm: fakeNpm().npm, ...linux })
  assert.equal(used.program, 'used')
  const linked = join(second, 'node_modules', 'left-pad', 'index.js')
  const before = readFileSync(shared, 'utf8')
  assert.throws(() => appendFileSync(linked, '// an agent edits the core in place\n'), { code: 'EACCES' })
  assert.equal(readFileSync(shared, 'utf8'), before, 'no other app changed')
  assert.equal(writableBits(join(second, 'node_modules', '.package-lock.json')) !== 0, true, 'npm can rewrite the app\'s own lockfile')
  assert.equal(writableBits(join(second, 'node_modules', 'is-odd', 'index.js')) !== 0, true, 'the app\'s own package is writable')
  // npm replacing a package in one app removes the link from that app's folder and writes a new file: allowed, the Program keeps its file.
  rmSync(linked)
  writeFileSync(linked, 'module.exports = "replaced in second"\n')
  assert.equal(readFileSync(shared, 'utf8'), before)
}))

test('a Program made before D18 is made read-only on its next use, once; macOS clones are left as they were', () => scratch(async root => {
  const program = join(root, 'program', 'blends-1.7.30')
  const file = join(program, 'node_modules', 'pkg', 'index.js')
  mkdirSync(join(program, 'node_modules', 'pkg'), { recursive: true })
  writeFileSync(file, 'x\n')
  assert.equal(sealProgram(program, 'darwin'), 0)
  assert.notEqual(writableBits(file), 0, 'macOS: untouched')
  assert.equal(sealProgram(program, 'linux'), 1)
  assert.equal(writableBits(file), 0)
  chmodSync(file, 0o644)
  assert.equal(sealProgram(program, 'linux'), 0, 'sealed once: the marker says so')
}))
