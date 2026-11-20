export { findSecrets, type SecretFinding } from './secrets.js'
export { readAppIdentity, withVisibility, type AppIdentity, type Visibility } from './identity.js'
export type { GitPort, HostingPort } from './ports.js'
export { saveApp, type SaveResult } from './save.js'
export { connectRemote, type ConnectResult } from './connect.js'
export { PersistenceError, gitCli, githubHosting } from './adapters.js'
export {
  CATEGORIES_URL,
  CATEGORY_KEYWORD,
  placementLabel,
  placementOf,
  placementProblem,
  readCategories,
  SUBCATEGORY_KEYWORD,
  withPlacement,
  type CatalogCategory,
  type Placement,
} from './placement.js'
