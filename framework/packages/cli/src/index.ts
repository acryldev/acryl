export { type AddOptions, add, listPlugins, parseAddOptions } from './add'
export { HELP, runCli, VERSION } from './cli'
export { findDesktopShell } from './desktop-shell'
export { isFramedByPackages } from './frame-release'
export {
  FRAME_URL_FILE,
  type FrameUrlRecord,
  frameHome,
  frameUrlPath,
  lookUpFrameUrl,
  openFrame,
  readFrameUrl,
  removeFrameUrl,
  tokenOfFrameUrl,
  writeFrameUrl,
} from './frame-url'
export { type InitOptions, init, parseInitOptions, UsageError } from './init'
export type { Io } from './io'
export {
  closure,
  copyPlugin,
  isOmitted,
  type LibraryPlugin,
  libraryRoot,
  readLibrary,
} from './library'
export {
  assertTargetFree,
  copyTemplate,
  isValidName,
  mergeDependencies,
  mergeTooling,
  nameFrom,
  readTemplatePlugins,
  TargetNotEmptyError,
} from './project'
export {
  isTemplate,
  resolveTemplate,
  TEMPLATE_ALIASES,
  TEMPLATE_SUMMARY,
  TEMPLATES,
  type Template,
  templateDir,
  templatesRoot,
} from './templates'
export { parseUpdateOptions, type UpdateOptions, update } from './update'
export { parseUpgradeOptions, type UpgradeOptions, upgrade } from './upgrade'
