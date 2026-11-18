// @vitest-environment jsdom
/** The snapshot carries the page's visible text (spec 049 slice 12): a value is read off the page as written, with no markup added for the agent. */

import { afterEach, describe, expect, it } from 'vitest'
import { UiDriver } from '../../src/page/driver/driver.ts'
import type { UiSnapshot } from '../../src/page/protocol.ts'
import { renderSnapshot } from '../../src/page/snapshot-text.ts'

afterEach(() => { document.body.replaceChildren() })

const snap = async (driver: UiDriver): Promise<UiSnapshot> => (await driver.handle({ op: 'snapshot' })) as UiSnapshot
const texts = (snapshot: UiSnapshot): string[] => snapshot.nodes.filter(node => node.role === 'text').map(node => node.name)

describe('visible text in a snapshot', () => {
  it('lists each run of text in reading order, so a value in a plain span is readable', async () => {
    document.body.innerHTML = `<main>
      <h1>Pomodoro</h1>
      <p>Time left: <span>24:59</span> of <b>25:00</b></p>
      <div>Sessions today</div><div>3</div>
    </main>`
    const snapshot = await snap(new UiDriver({ document: () => document }))
    expect(texts(snapshot)).toEqual(['Time left:', '24:59', 'of', '25:00', 'Sessions today', '3'])
    const rendered = renderSnapshot(snapshot)
    expect(rendered).toContain('- text "24:59" [ref=')
    // Inside the main landmark, one level deeper than it.
    expect(snapshot.nodes.find(node => node.name === '24:59')?.depth).toBe(1)
  })

  it('does not repeat text that is already a name or a value: buttons, links, headings, labels, fields, a select\'s options', async () => {
    document.body.innerHTML = `
      <h2>Settings</h2>
      <button type="button">Save <span>now</span></button>
      <a href="/help">Help</a>
      <label>Project <input type="text" value="acryl"></label>
      <textarea aria-label="Notes">draft</textarea>
      <select aria-label="Mode"><option>Fast</option><option>Careful</option></select>
      <div role="status">Saved</div>
      <p>Only this</p>`
    const snapshot = await snap(new UiDriver({ document: () => document }))
    expect(texts(snapshot)).toEqual(['Only this'])
    expect(snapshot.nodes.map(node => [node.role, node.name])).toContainEqual(['button', 'Save now'])
  })

  it('leaves out hidden text, the driver\'s own bar, and anything inside a marked area', async () => {
    document.body.innerHTML = `
      <p hidden>hidden</p><p aria-hidden="true">icon</p><p style="display:none">none</p>
      <div data-acryl-agent-control>agent bar</div>
      <div data-acryl-sensitive>token 1234</div>
      <p>shown</p>`
    expect(texts(await snap(new UiDriver({ document: () => document })))).toEqual(['shown'])
  })

  it('clips a long run and collapses its whitespace', async () => {
    document.body.innerHTML = `<p>  a\n\n  b   ${'x'.repeat(400)}</p>`
    const [run] = texts(await snap(new UiDriver({ document: () => document })))
    expect(run?.startsWith('a b x')).toBe(true)
    expect(run).toHaveLength(200)
    expect(run?.endsWith('…')).toBe(true)
  })

  it('keeps a text ref while its text is there, and calls it stale once the text changed', async () => {
    document.body.innerHTML = '<p>Count: <output id="n">1</output></p>'
    const driver = new UiDriver({ document: () => document })
    const snapshot = await snap(driver)
    const ref = snapshot.nodes.find(node => node.name === '1')?.ref as string
    await expect(driver.handle({ op: 'click', ref })).resolves.toMatchObject({ ok: true, target: { role: 'text', name: '1' } })
    ;(document.getElementById('n') as HTMLElement).textContent = '2'
    await expect(driver.handle({ op: 'click', ref })).rejects.toMatchObject({ code: 'stale-ref' })
    expect(texts(await snap(driver))).toEqual(['Count:', '2'])
  })
})
