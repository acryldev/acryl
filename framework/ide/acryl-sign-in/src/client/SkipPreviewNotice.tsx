/**
 * Takes the place of the upstream "Preview Notice" (DeepSeek Harness's own welcome step, `settings.onboarding` entry `welcome-notice`). ACRYL shows no
 * such notice: this entry ends its step at once, so the first-run flow moves straight on to the model step, and it saves nothing (the notice's
 * acknowledgement is what failed to save in a plain browser window).
 */
import { useEffect } from 'react'
import type { ReactNode } from 'react'

export interface SkipPreviewNoticeOwner {
  /** Ends this step and hands the first-run flow to the next entry. */
  readonly complete: () => void
}

export function SkipPreviewNotice({ complete }: SkipPreviewNoticeOwner): ReactNode {
  useEffect(() => { complete() }, [complete])
  return null
}
