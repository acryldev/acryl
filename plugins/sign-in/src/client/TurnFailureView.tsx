/**
 * The chat's row for a failed turn (DeepSeek's chat `conversation.chat.node` entry `turn-error`, shadowed): the provider's
 * sentence with its links, a hint when the fix is known, and the failure as recorded behind Details.
 */

import type { ReactNode } from 'react'
import type { PropsLocale } from '@acryldev/ui/frame'
import { describeTurnFailure, linkParts } from './turn-failure.ts'

export interface TurnFailureInjected {
  /** Opens a page outside the app (the system browser on Desktop, a new tab on Web). */
  readonly openExternal: (url: string) => void
}

/** The keyed node DeepSeek's chat hands its `turn-error` renderer. */
export interface TurnFailureNode {
  readonly node: { readonly data: { readonly message: string, readonly code?: string } }
}

export type TurnFailureViewProps = TurnFailureNode & TurnFailureInjected & PropsLocale<'acryl.sign-in'>

function Linked({ sentence, openExternal }: { readonly sentence: string } & TurnFailureInjected): ReactNode {
  return linkParts(sentence).map((part, index) => 'href' in part
    ? <a key={index} href={part.href} target="_blank" rel="noopener noreferrer" onClick={(event) => { event.preventDefault(); openExternal(part.href) }}>{part.text}</a>
    : <span key={index}>{part.text}</span>)
}

export function TurnFailureView({ node, openExternal, t }: TurnFailureViewProps): ReactNode {
  const failure = describeTurnFailure(node.data.message, node.data.code)
  const text = 'key' in failure.text ? t(failure.text.key) : failure.text.said
  return (
    <div className="acrylTurnFailure" role="status">
      <span className="acrylTurnFailureDot" aria-hidden="true" />
      <div className="acrylTurnFailureCopy">
        <span className="acrylTurnFailureTitle">{t(failure.title)}</span>
        <span className="acrylTurnFailureText"><Linked sentence={text} openExternal={openExternal} /></span>
        {failure.hint !== undefined && <p className="acrylTurnFailureHint"><Linked sentence={t(failure.hint)} openExternal={openExternal} /></p>}
        {failure.raw !== undefined && (
          <details className="acrylTurnFailureDetails">
            <summary>{t('failureDetails')}</summary>
            <code>{failure.raw}</code>
          </details>
        )}
      </div>
      {node.data.code !== undefined && <code className="acrylTurnFailureCode">{node.data.code}</code>}
    </div>
  )
}
