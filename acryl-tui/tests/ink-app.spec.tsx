import { render } from 'ink-testing-library'
import { describe, expect, it } from 'vitest'
import { AcrylInkApp } from '../src/render/ink-app.tsx'

describe('AcrylInkApp', () => {
  it('projects the active profile and runtime ownership into the terminal frame', () => {
    const app = render(
      <AcrylInkApp profile="acryl-dev" ownerMode="owner" runtimeState="ready" />,
    )

    expect(app.lastFrame()).toContain('ACRYL')
    expect(app.lastFrame()).toContain('Profile: acryl-dev')
    expect(app.lastFrame()).toContain('Runtime: ready (owner)')
  })
})
