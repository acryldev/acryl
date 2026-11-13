/**
 * The first-run step: connect a model. It shows Settings > Models itself (the DeepSeek key, third-party providers, a custom model API, and the account
 * sign-in at its foot), so everything can be done right here, and a button opens Settings for the rest. It fills the `settings.models.sign-in` seat the
 * first-run dialog renders before its own key editor; saving a credential makes a provider ready, which ends the step by itself.
 */
import type { ReactNode } from 'react'
import type { InjectFace, PropsLocale } from '@acryl/ui/frame'
import { ModelsPane, type RegisteredSection } from './ModelsPane.tsx'
import { openModelsSettings } from './open-settings.ts'
import { SignInCard, type SignInCardInjected } from './SignInCard.tsx'

export interface ConnectChoiceOwner {
  /** Ends the step without a credential (the first-run dialog goes away). */
  readonly complete: () => void
  /** Moves on to the dialog's own DeepSeek key box (not used: the Models section has the key box). */
  readonly useApiKey: () => void
}

export interface ConnectChoiceInjected extends SignInCardInjected {
  /** The Models section as the Settings window renders it, or undefined when the models plugin is not composed. */
  readonly modelsSection: () => RegisteredSection | undefined
}

export type ConnectChoiceProps = ConnectChoiceOwner & PropsLocale<'acryl.sign-in'> & InjectFace<ConnectChoiceInjected>

export function ConnectChoice({ complete, api, openExternal, copy, language, modelsSection, t }: ConnectChoiceProps): ReactNode {
  return (
    <div className="acrylConnectBackdrop">
      <div className="acrylConnect" role="dialog" aria-modal="true" aria-label={t('connectTitle')}>
        <h2 className="acrylConnectTitle">{t('connectTitle')}</h2>
        <p className="acrylSignInText">{t('connectIntro')}</p>
        <div className="acrylConnectModels">
          <ModelsPane section={modelsSection()} footer={<SignInCard api={api} openExternal={openExternal} copy={copy} language={language} t={t} />} />
        </div>
        <div className="acrylConnectFoot">
          <button type="button" className="acrylSignInButton" onClick={() => { complete(); openModelsSettings() }}>{t('connectSettingsAction')}</button>
          <button type="button" className="acrylSignInButton" onClick={complete}>{t('connectLater')}</button>
        </div>
        <span className="acrylConnectHint">{t('connectSettingsText')}</span>
      </div>
    </div>
  )
}
