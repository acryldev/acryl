/** Dictionaries for the account sign-in card on Settings > Models. */

export type SignInLocaleKey =
  | 'heading' | 'description' | 'signIn' | 'signedIn' | 'signInAgain' | 'otherProviders' | 'otherPlaceholder'
  | 'claude' | 'claudeVia' | 'chatgpt' | 'chatgptVia' | 'deepseek' | 'deepseekVia'
  | 'browserTitle' | 'browserText' | 'openPage' | 'copyLink' | 'copied' | 'working' | 'continue' | 'cancel'
  | 'failed' | 'tryAgain' | 'done' | 'unavailable'
  | 'connectTitle' | 'connectIntro' | 'connectSettingsText' | 'connectSettingsAction' | 'connectLater'

export const en: Record<SignInLocaleKey, string> = {
  heading: 'Sign in with an account',
  description: 'Use your Claude, ChatGPT or DeepSeek subscription instead of an API key. For an API key, add the provider above.',
  signIn: 'Sign in',
  signedIn: 'Signed in',
  signInAgain: 'Sign in again',
  otherProviders: 'Other providers',
  otherPlaceholder: 'Choose a provider',
  claude: 'Claude',
  claudeVia: 'Anthropic, Claude Pro or Max',
  chatgpt: 'ChatGPT',
  chatgptVia: 'OpenAI, ChatGPT Plus or Pro',
  deepseek: 'DeepSeek',
  deepseekVia: 'DeepSeek account',
  browserTitle: 'Continue in your browser',
  browserText: 'Finish signing in on the page that opened. If it did not open, open it here.',
  openPage: 'Open sign-in page',
  copyLink: 'Copy link',
  copied: 'Link copied',
  working: 'Signing in...',
  continue: 'Continue',
  cancel: 'Cancel',
  failed: 'Sign-in did not finish',
  tryAgain: 'Try again',
  done: 'Signed in. New chats use this provider when the current default cannot answer.',
  unavailable: 'Account sign-in is not available right now.',
  connectTitle: 'Connect a model to get started',
  connectIntro: 'ACRYL needs a model to work with. DeepSeek is the default: paste its API key below. Or pick another provider, add your own model API, or sign in with an account.',
  connectSettingsText: 'Settings > Models has more providers and every option; you can change all of this there at any time.',
  connectSettingsAction: 'More providers in Settings',
  connectLater: 'Later',
}

export const zh: Record<SignInLocaleKey, string> = {
  heading: '使用账号登录',
  description: '使用 Claude、ChatGPT 或 DeepSeek 订阅代替 API 密钥。如需使用 API 密钥，请在上方添加模型提供方。',
  signIn: '登录',
  signedIn: '已登录',
  signInAgain: '重新登录',
  otherProviders: '其他提供方',
  otherPlaceholder: '选择提供方',
  claude: 'Claude',
  claudeVia: 'Anthropic，Claude Pro 或 Max',
  chatgpt: 'ChatGPT',
  chatgptVia: 'OpenAI，ChatGPT Plus 或 Pro',
  deepseek: 'DeepSeek',
  deepseekVia: 'DeepSeek 账号',
  browserTitle: '请在浏览器中继续',
  browserText: '请在打开的页面中完成登录。如果页面没有打开，可在此处打开。',
  openPage: '打开登录页面',
  copyLink: '复制链接',
  copied: '链接已复制',
  working: '正在登录...',
  continue: '继续',
  cancel: '取消',
  failed: '登录未完成',
  tryAgain: '重试',
  done: '已登录。当前默认模型不可用时，新对话将使用此提供方。',
  unavailable: '当前无法使用账号登录。',
  connectTitle: '连接模型以开始使用',
  connectIntro: 'ACRYL 需要一个模型才能工作。默认使用 DeepSeek：在下方粘贴其 API 密钥。也可以选择其他提供方、添加自己的模型 API，或使用账号登录。',
  connectSettingsText: '设置 > 模型里有更多提供方和全部选项，之后可随时在那里更改。',
  connectSettingsAction: '在设置中查看更多提供方',
  connectLater: '稍后',
}
