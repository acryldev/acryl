// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConnectChoice } from '../../src/client/ConnectChoice.tsx'
import { en } from '../../src/client/locales.ts'

afterEach(cleanup)

const t = ((key: keyof typeof en): string => en[key]) as never
const base = { api: { providers: async () => ({ providers: [] }), attempt: async () => null } as never, openExternal: () => {}, copy: async () => {}, language: () => undefined, t }

/** A section as the ledger stores the Models one: a component, and the face it registered with the store its hook reads. */
function registered() {
  let value = { rows: ['deepseek'] }
  const listeners = new Set<() => void>()
  const store = { getSnapshot: () => value, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } } }
  const Section = (props: { useSnapshot: (select: (value: unknown) => unknown) => unknown, renderSlot: (name: string) => unknown, label: string }) => (
    <div data-testid="models">{props.label}: {String((props.useSnapshot(snapshot => snapshot) as { rows: string[] }).rows)}<div data-testid="footer">{props.renderSlot('settings.models.footer') as never}</div></div>
  )
  return { section: { component: Section, inject: () => ({ label: 'Models', hooks: { snapshot: store } }) }, set: (next: typeof value) => { value = next; for (const listener of listeners) listener() } }
}

describe('ConnectChoice (the first-run step)', () => {
  it('renders the registered Models section with its store hook bound, and the sign-in card in its footer seat', () => {
    const { section } = registered()
    render(<ConnectChoice {...base} complete={() => {}} useApiKey={() => {}} modelsSection={() => section} />)
    expect(screen.getByTestId('models').textContent).toContain('Models: deepseek')
    expect(screen.getByTestId('footer')).toBeTruthy()
  })

  it('ends the step on Later, and on More providers in Settings; with no Models section it still offers both', () => {
    const complete = vi.fn()
    render(<ConnectChoice {...base} complete={complete} useApiKey={() => {}} modelsSection={() => undefined} />)
    expect(screen.queryByTestId('models')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Later' }))
    fireEvent.click(screen.getByRole('button', { name: 'More providers in Settings' }))
    expect(complete).toHaveBeenCalledTimes(2)
  })
})
