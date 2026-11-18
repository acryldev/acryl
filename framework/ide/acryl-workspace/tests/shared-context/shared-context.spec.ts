import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ProjectRegistryView, WorkspaceSummary } from '../../src/projects/contract.ts'
import { CONTEXT_PROMPT_BUDGET, renderContextPrompt } from '../../src/shared-context/render.ts'
import { SharedContext, checkoutOf, isInside, samePlaceOrInside } from '../../src/shared-context/service.ts'

const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

function temp(name: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), `acryl-shared-${name}-`)))
  dirs.push(dir)
  return dir
}

function repo(name: string): string {
  const dir = temp(name)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@l', 'commit', '-q', '--allow-empty', '-m', 's'], { cwd: dir })
  return dir
}

function registry(workspaces: WorkspaceSummary[], current = 'default') {
  const listeners = new Set<(view: ProjectRegistryView) => void>()
  let view: ProjectRegistryView = { paths: [], adopted: true, workspaces, current }
  return {
    view: () => view,
    onChange: (listener: (view: ProjectRegistryView) => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    change(next: Partial<ProjectRegistryView>) { view = { ...view, ...next }; for (const listener of [...listeners]) listener(view) },
  }
}

const ws = (id: string, kind: WorkspaceSummary['kind'], projects: string[]): WorkspaceSummary => ({ id, name: id, kind, projects })

describe('the shared context prompt', () => {
  const input = { name: 'Payments', projects: [{ name: 'api', path: '/p/api', instructions: ['CLAUDE.md'] }], brief: '', documentPath: '/h/WORKSPACE.md', briefPath: '/h/BRIEF.md' }

  it('names the workspace, its projects with their instructions, and where the rest is', () => {
    const text = renderContextPrompt(input)
    expect(text).toContain('"Payments"')
    expect(text).toContain('- api: /p/api (instructions: CLAUDE.md)')
    expect(text).toContain('Full context: /h/WORKSPACE.md')
    expect(text).not.toContain('Brief:')
  })

  it('cuts a long brief to stay within its budget, and says so', () => {
    const text = renderContextPrompt({ ...input, brief: 'x'.repeat(20_000) })
    expect(text.length).toBeLessThanOrEqual(CONTEXT_PROMPT_BUDGET)
    expect(text).toContain('(brief cut here; the rest is in the file)')
  })
})

describe('isInside and checkoutOf', () => {
  it('matches folders with either separator, not a sibling with the same prefix', () => {
    expect(isInside('/p/api/src', '/p/api')).toBe(true)
    expect(isInside('C:\\p\\api\\src', 'C:\\p\\api')).toBe(true)
    expect(isInside('/p/api-old', '/p/api')).toBe(false)
  })

  it('finds the main checkout of a linked worktree that lives outside it', () => {
    const main = repo('main')
    const linked = join(temp('elsewhere'), 'feature')
    execFileSync('git', ['worktree', 'add', '-q', '-b', 'feature', linked], { cwd: main })
    mkdirSync(join(linked, 'src'))
    // Git writes the pointer its own way (on Windows long names where the temp folder may be an 8.3 short name), so compare the folders, not the text.
    expect(realpathSync.native(checkoutOf(join(linked, 'src')) ?? '')).toBe(realpathSync.native(main))
    expect(checkoutOf(join(main))).toBe(main)
    expect(samePlaceOrInside(join(linked, 'src'), linked)).toBe(true)
  })
})

describe('SharedContext', () => {
  it('belongs a folder to the shown shared workspace first, to another shared one next, never to an individual one', () => {
    const api = repo('api')
    const web = repo('web')
    const reg = registry([ws('default', 'individual', [api, web]), ws('a', 'shared', [api]), ws('b', 'shared', [api, web])], 'b')
    const shared = new SharedContext({ registry: reg, home: temp('home') })
    expect(shared.forFolder(join(api))?.id).toBe('b')
    reg.change({ current: 'default' })
    expect(shared.forFolder(api)?.id).toBe('a')
    expect(shared.forFolder(temp('unrelated'))).toBeUndefined()
    const individual = new SharedContext({ registry: registry([ws('default', 'individual', [api])]), home: temp('home') })
    expect(individual.contextFor(api)).toBeUndefined()
  })

  it('tells an agent the other projects to add, from inside a linked worktree too', () => {
    const api = repo('api')
    const web = repo('web')
    const linked = join(temp('elsewhere'), 'api-feature')
    execFileSync('git', ['worktree', 'add', '-q', '-b', 'feature', linked], { cwd: api })
    const shared = new SharedContext({ registry: registry([ws('s', 'shared', [api, web])], 's'), home: temp('home') })
    const context = shared.contextFor(linked)
    expect(context?.workspace.id).toBe('s')
    expect(context?.otherProjects(linked)).toEqual([web])
  })

  it('keeps WORKSPACE.md current as the registry changes, and writes the brief the user saves', () => {
    const api = repo('api')
    writeFileSync(join(api, 'AGENTS.md'), '# rules')
    const home = temp('home')
    const reg = registry([ws('default', 'individual', []), ws('s', 'shared', [])], 's')
    const shared = new SharedContext({ registry: reg, home })
    const stop = shared.start(() => { throw new Error('unexpected') })
    expect(readFileSync(shared.documentPath('s'), 'utf8')).toContain('(no projects yet)')
    reg.change({ workspaces: [ws('default', 'individual', []), ws('s', 'shared', [api])] })
    expect(readFileSync(shared.documentPath('s'), 'utf8')).toContain(`(instructions: AGENTS.md)`)
    shared.setBrief('s', 'We ship the API before the web client.')
    expect(shared.brief('s')).toBe('We ship the API before the web client.')
    expect(readFileSync(shared.documentPath('s'), 'utf8')).toContain('We ship the API before the web client.')
    expect(shared.promptFor('s')).toContain('We ship the API before the web client.')
    expect(shared.promptFor('default')).toBeUndefined()
    expect(() => { shared.setBrief('nope', 'x') }).toThrow()
    stop()
  })
})
