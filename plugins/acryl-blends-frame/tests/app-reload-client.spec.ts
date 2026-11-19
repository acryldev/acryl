import { describe, expect, it } from 'vitest'
import { FRAME_APP_PATH } from '../src/contract.ts'
import { AppReloadStore } from '../src/client/app-reload.ts'

const view = (seq: number, generation: number, error: string | null = null): Response =>
  new Response(JSON.stringify({ seq, generation, error }), { status: 200, headers: { 'content-type': 'application/json' } })

/** A store over scripted answers: each ask takes the next answer; once they run out the loop is stopped (the test's last act). */
function storeOf(answers: (Response | Error)[]) {
  const asked: string[] = []
  const reloaded: number[] = []
  const controller = new AbortController()
  const store = new AppReloadStore(
    () => { reloaded.push(asked.length) },
    async (input) => {
      asked.push(input)
      const next = answers.shift()
      if (next === undefined) {
        controller.abort()
        throw new Error('aborted')
      }
      if (next instanceof Error) throw next
      return next
    },
    async () => {},
  )
  return { store, asked, reloaded, run: () => store.run(controller.signal) }
}

describe('AppReloadStore', () => {
  it('asks for the state first, then for a change after the number it was given', async () => {
    const { store, asked, reloaded, run } = storeOf([view(0, 0), view(1, 1), view(2, 2)])
    await run()
    expect(asked).toEqual([FRAME_APP_PATH, `${FRAME_APP_PATH}?after=0`, `${FRAME_APP_PATH}?after=1`, `${FRAME_APP_PATH}?after=2`])
    // The first answer is where the app is, not a change; each new generation after it reloads the canvas.
    expect(reloaded).toHaveLength(2)
    expect(store.getSnapshot().error).toBeUndefined()
  })

  it('does not reload for an answer with the same generation (the Host\'s long poll timing out)', async () => {
    const { reloaded, run } = storeOf([view(4, 2), view(4, 2), view(4, 2)])
    await run()
    expect(reloaded).toEqual([])
  })

  it('keeps an error of the Host for the bar, and clears it when a load takes', async () => {
    const { store, run } = storeOf([view(0, 0), view(1, 0, 'src/a.ts:1 Expression expected')])
    const heard: (string | undefined)[] = []
    store.subscribe(() => { heard.push(store.getSnapshot().error) })
    await run()
    expect(heard).toEqual(['src/a.ts:1 Expression expected'])
    const fixed = storeOf([view(1, 0, 'bad'), view(2, 1, null)])
    const states: (string | undefined)[] = []
    fixed.store.subscribe(() => { states.push(fixed.store.getSnapshot().error) })
    await fixed.run()
    expect(states).toEqual(['bad', undefined])
    expect(fixed.reloaded).toHaveLength(1)
  })

  it('asks for the state again after a failed ask, and reloads when the Host came back with another generation', async () => {
    const { asked, reloaded, run } = storeOf([view(5, 3), new Error('network'), view(0, 0)])
    await run()
    expect(asked.slice(0, 3)).toEqual([FRAME_APP_PATH, `${FRAME_APP_PATH}?after=5`, FRAME_APP_PATH])
    expect(reloaded).toHaveLength(1)
  })

  it('stops following a Host that has no reload', async () => {
    const { asked, run } = storeOf([new Response('', { status: 404 }), view(0, 0)])
    await run()
    expect(asked).toHaveLength(1)
  })
})
