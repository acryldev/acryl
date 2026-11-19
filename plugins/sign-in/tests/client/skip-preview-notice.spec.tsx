// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SkipPreviewNotice } from '../../src/client/SkipPreviewNotice.tsx'

afterEach(cleanup)

describe('SkipPreviewNotice', () => {
  it('shows nothing and ends its first-run step at once, so the flow moves on to the model step', () => {
    const complete = vi.fn()
    const { container } = render(<SkipPreviewNotice complete={complete} />)
    expect(container.textContent).toBe('')
    expect(complete).toHaveBeenCalledTimes(1)
  })
})
