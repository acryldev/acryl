/**
 * The first-run step before the API key box: how to connect a model. DeepSeek (the default provider) with an API key comes first; an account
 * sign-in (Claude, ChatGPT, DeepSeek account) runs right here through the same card Settings > Models shows; and a button opens Settings > Models for
 * everything else. It fills the `settings.models.sign-in` seat the first-run dialog renders before its key editor.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { InjectFace, PropsLocale } from '@acryl/ui/frame'
import { openModelsSettings } from './open-settings.ts'
import { SignInCard, type SignInCardInjected } from './SignInCard.tsx'

export interface ConnectChoiceOwner {
  /** Ends the step without a credential (the first-run dialog goes away). */
  readonly complete: () => void
  /** Moves on to the dialog's own DeepSeek key box. */
  readonly useApiKey: () => void
}

export type ConnectChoiceProps = ConnectChoiceOwner & PropsLocale<'acryl.sign-in'> & InjectFace<SignInCardInjected>

export function ConnectChoice({ complete, useApiKey, api, openExternal, copy, language, t }: ConnectChoiceProps): ReactNode {
  const [account, setAccount] = useState(false)
  const choice = (title: string, text: string, action: string, onClick: () => void, badge?: string): ReactNode => (
    <div className="acrylConnectRow">
      <div className="acrylConnectText"><strong>{title}{badge === undefined ? null : <span className="acrylConnectBadge">{badge}</span>}</strong><span>{text}</span></div>
      <button type="button" className="acrylSignInButton" data-primary={badge === undefined ? undefined : ''} onClick={onClick}>{action}</button>
    </div>
  )
  return (
    <div className="acrylConnectBackdrop">
      <div className="acrylConnect" role="dialog" aria-modal="true" aria-label={t('connectTitle')}>
        <h2 className="acrylConnectTitle">{t('connectTitle')}</h2>
        <p className="acrylSignInText">{t('connectIntro')}</p>
        {account
          ? (
            <>
              <SignInCard api={api} openExternal={openExternal} copy={copy} language={language} t={t} />
              <div className="acrylSignInActions"><button type="button" className="acrylSignInButton" onClick={() => { setAccount(false) }}>{t('connectBack')}</button></div>
            </>
          )
          : (
            <>
              {choice(t('connectKey'), t('connectKeyText'), t('connectKeyAction'), useApiKey, t('connectDefault'))}
              {choice(t('connectAccount'), t('connectAccountText'), t('connectAccountAction'), () => { setAccount(true) })}
              {choice(t('connectSettings'), t('connectSettingsText'), t('connectSettingsAction'), () => { complete(); openModelsSettings() })}
              <div className="acrylSignInActions"><button type="button" className="acrylSignInButton" onClick={complete}>{t('connectLater')}</button></div>
            </>
          )}
      </div>
    </div>
  )
}
