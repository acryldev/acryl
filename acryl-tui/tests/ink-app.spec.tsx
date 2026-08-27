import { render } from 'ink-testing-library'
import type { DurableSessionMessagePort } from 'acryl-harness-runtime'
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

  it('accepts text and records a local dispatch-pending message on Enter', async () => {
    const app = render(
      <AcrylInkApp profile="acryl-dev" ownerMode="owner" runtimeState="ready" />,
    )

    app.stdin.write('Hello ACRYL')
    await new Promise(resolve => setImmediate(resolve))
    expect(app.lastFrame()).toContain('Message: Hello ACRYL')

    app.stdin.write('\r')
    await new Promise(resolve => setImmediate(resolve))
    expect(app.lastFrame()).toContain('Dispatch pending: Hello ACRYL')
  })

  it('submits composer text through the injected durable-session port', async () => {
    const dispatched: string[] = []
    const port: DurableSessionMessagePort = {
      async dispatch(message) {
        dispatched.push(`${message.sessionId}:${message.text}`)
        return { accepted: true, sessionId: message.sessionId, messageId: 'message-1' }
      },
    }
    const app = render(
      <AcrylInkApp
        profile="acryl-dev"
        ownerMode="owner"
        runtimeState="ready"
        sessionId="session-1"
        messagePort={port}
      />,
    )

    app.stdin.write('Persist this')
    await new Promise(resolve => setImmediate(resolve))
    app.stdin.write('\r')
    await new Promise(resolve => setImmediate(resolve))

    expect(dispatched).toEqual(['session-1:Persist this'])
  })
})
