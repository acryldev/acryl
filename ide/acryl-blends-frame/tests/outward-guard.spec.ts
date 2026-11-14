import { describe, expect, it } from 'vitest'
import { guardOutwardCommands, outwardAction, outwardApproval, type OutwardDecision, type OutwardEvents, type OutwardExecution } from '../src/outward-guard.ts'

describe('what a shell command sends out of the machine', () => {
  it('finds a push, a GitHub write and a publish, wherever they sit in the command', () => {
    expect(outwardAction('git push')).toBe('git push')
    expect(outwardAction('git -C app push -u origin main')).toBe('git push')
    expect(outwardAction('npm test && git add . && git commit -m x && git push origin HEAD')).toBe('git push')
    expect(outwardAction('GIT_TERMINAL_PROMPT=0 sudo git push')).toBe('git push')
    expect(outwardAction('timeout 60 /usr/bin/git push --tags')).toBe('git push')
    expect(outwardAction('gh repo create ana/notes --private --source . --push')).toBe('gh repo create')
    expect(outwardAction('gh release create v0.1.0 notes.tgz')).toBe('gh release create')
    expect(outwardAction('gh pr create --fill')).toBe('gh pr create')
    expect(outwardAction('gh api repos/ana/notes -X DELETE')).toBe('gh api (a write)')
    expect(outwardAction('gh api repos/ana/notes/topics -f names[]=x')).toBe('gh api (a write)')
    expect(outwardAction('npm publish --access public')).toBe('npm publish')
    expect(outwardAction('pnpm publish')).toBe('pnpm publish')
    // The app's own share with the yes given; the plan alone sends nothing.
    expect(outwardAction('npm run share -- --confirm \'{"repository":"me/shop"}\'')).toBe('share the app')
    expect(outwardAction('node plugins/save/share-cli.ts --confirm {}')).toBe('share the app')
    expect(outwardAction('npm run share -- --json')).toBeUndefined()
    expect(outwardAction('npm run share')).toBeUndefined()
    expect(outwardAction('npx npm dist-tag add x@1 latest')).toBe('npm dist-tag')
  })

  it('lets what stays here run unasked', () => {
    expect(outwardAction('git status && git log --oneline -3')).toBeUndefined()
    expect(outwardAction('git commit -m "push the button"')).toBeUndefined()
    expect(outwardAction('git stash push')).toBeUndefined()
    expect(outwardAction('git fetch && git pull --ff-only')).toBeUndefined()
    expect(outwardAction('gh repo view ana/notes')).toBeUndefined()
    expect(outwardAction('gh api repos/ana/notes')).toBeUndefined()
    expect(outwardAction('gh pr list')).toBeUndefined()
    expect(outwardAction('npm test && npm run check')).toBeUndefined()
    expect(outwardAction('npm pack --dry-run')).toBeUndefined()
    expect(outwardAction('echo publish')).toBeUndefined()
    // A rehearsal sends nothing (the live run's agent checked with one before pushing).
    expect(outwardAction('git fetch origin; git push --dry-run origin main 2>&1 | tail -5')).toBeUndefined()
    expect(outwardAction('git push -n')).toBeUndefined()
    expect(outwardAction('npm publish --dry-run')).toBeUndefined()
    expect(outwardAction('git push --dry-run && git push')).toBe('git push')
  })

  it('asks for a shell call that pushes and for the app\'s save_app tool, and for nothing else', () => {
    expect(outwardApproval({ name: 'bash', arguments: { command: 'git push' } })).toEqual({ action: 'git push', command: 'git push' })
    expect(outwardApproval({ name: 'bash', arguments: JSON.stringify({ command: 'npm publish' }) })).toEqual({ action: 'npm publish', command: 'npm publish' })
    expect(outwardApproval({ name: 'save_app', arguments: { message: 'x' } })?.action).toContain('save_app')
    expect(outwardApproval({ name: 'read', arguments: { path: 'git push' } })).toBeUndefined()
    expect(outwardApproval({ name: 'bash', arguments: { command: 'ls' } })).toBeUndefined()
  })
})

describe('the guard on DSH\'s pre-dispatch stage', () => {
  function mounted() {
    let listener: ((exec: OutwardExecution, next: () => Promise<OutwardDecision>) => Promise<OutwardDecision>) | undefined
    let disposed = false
    const lines: string[] = []
    const events: OutwardEvents = {
      on: (_name, handler) => {
        listener = handler
        return () => { disposed = true }
      },
    }
    const stop = guardOutwardCommands(events, line => { lines.push(line) })
    const call = (exec: OutwardExecution, decided: OutwardDecision = { kind: 'allow' }) => {
      if (listener === undefined) throw new Error('not listening')
      return listener(exec, async () => decided)
    }
    return { call, lines, stop, disposed: () => disposed }
  }

  it('turns a push the access mode would run unasked into the person\'s approval, naming the command', async () => {
    const guard = mounted()
    const decided = await guard.call({ name: 'bash', arguments: { command: 'git push origin main' } })
    expect(decided).toEqual({
      kind: 'ask',
      reason: 'outward: git push',
      displayReason: { en: 'The agent wants to run git push origin main. It sends your work out of this computer under your name (git push). Allow it once?' },
    })
    expect(guard.lines).toEqual(['acryl-blends-frame: asked the person before git push'])
  })

  it('keeps a refusal a refusal, leaves other calls as they were decided, and stops listening when disposed', async () => {
    const guard = mounted()
    const denied = { kind: 'deny', reason: 'the Host' } as const
    expect(await guard.call({ name: 'bash', arguments: { command: 'git push' } }, denied)).toBe(denied)
    expect(await guard.call({ name: 'bash', arguments: { command: 'git push' } }, { kind: 'cancel' })).toEqual({ kind: 'cancel' })
    expect(await guard.call({ name: 'bash', arguments: { command: 'npm test' } })).toEqual({ kind: 'allow' })
    guard.stop()
    expect(guard.disposed()).toBe(true)
  })
})
