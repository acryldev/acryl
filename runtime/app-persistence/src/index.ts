export { findSecrets, type SecretFinding } from './secrets.js'
export { readAppIdentity, withId, withLicense, withVersion, withVisibility, type AppIdentity, type Visibility } from './identity.js'
export type { GitPort, HostingPort } from './ports.js'
export { saveApp, type SaveResult } from './save.js'
export { connectRemote, type ConnectResult } from './connect.js'
export { GITHUB_VIA_GH, PersistenceError, gitCli, githubHosting } from './adapters.js'
export {
  CATEGORIES_URL,
  CATEGORY_KEYWORD,
  placementLabel,
  placementOf,
  placementProblem,
  readCategories,
  suggestPlacement,
  SUBCATEGORY_KEYWORD,
  withPlacement,
  type CatalogCategory,
  type Placement,
} from './placement.js'
export {
  adoptGithubToken,
  clearGithub,
  GITHUB_CLIENT_ID,
  GITHUB_FILE,
  canPushWorkflows,
  GITHUB_SCOPE,
  githubClientId,
  githubEnv,
  githubHome,
  pollGithubSignIn,
  readGithub,
  saveGithub,
  startGithubSignIn,
  type GithubConnection,
  type GithubSignInPoll,
  type GithubSignInStart,
} from './github-login.js'
