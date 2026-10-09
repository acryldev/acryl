/**
 * Where an ACRYL instance keeps what it authors inside a project (spec 036, "Many instances").
 *
 * An unscoped ACRYL (the default or development app) keeps the classic shared locations: `<workspace>/.acryl-extensions/` and `<workspace>/.acryl/blend/`, which
 * belong to the project and can be committed. An app with a project scope must never leak into, or load from, another app that opens the same folder, so
 * everything it authors lives under `<workspace>/.acryl/instances/<scope>/`. The instance-wide (global) scope is already private: it lives in the app's own home.
 *
 * The scope comes from the runtime's `appInstance` service, configured once when the pack is applied (`useAppInstance`); this module never reads the
 * environment. Invalid scope values are ignored, never used to build a path.
 */
import { existsSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

const SCOPE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u
const SCOPE_MAX = 64

let active = { projectScope: undefined, appHome: undefined }

/**
 * Configure the scopes from the app instance this pack runs in (the `appInstance` service: `{ home, projectScope?, definitionFile? }`). Returns the disposer
 * that restores the previous configuration, so it belongs in an effect.
 */
export function useAppInstance(instance, exists = existsSync) {
  const previous = active
  const scope = instance?.projectScope
  active = {
    projectScope: typeof scope === 'string' && scope.length <= SCOPE_MAX && SCOPE.test(scope) ? scope : undefined,
    appHome: typeof instance?.definitionFile === 'string' && typeof instance.home === 'string' && isAbsolute(instance.home) && exists(instance.definitionFile) ? instance.home : undefined,
  }
  return () => { active = previous }
}

/** The project scope this app writes under, or undefined for the classic shared locations. */
export function currentInstance() {
  return active.projectScope
}

function instanceRoot(workspaceDir, instance) {
  return join(workspaceDir, '.acryl', 'instances', instance)
}

/** Project-scope extensions folder. */
export function projectExtensionsDir(workspaceDir, instance = currentInstance()) {
  return instance === undefined ? join(workspaceDir, '.acryl-extensions') : join(instanceRoot(workspaceDir, instance), 'extensions')
}

/**
 * Captured Blend folder (manifest, lock, vendored sources, ledger). Inside an app it is the app folder itself: an app IS its Blend (one shape for
 * creating, capturing and restoring), whatever project the session has open.
 */
export function blendDir(workspaceDir, instance = currentInstance()) {
  if (active.appHome !== undefined) return active.appHome
  return instance === undefined ? join(workspaceDir, '.acryl', 'blend') : join(instanceRoot(workspaceDir, instance), 'blend')
}

/** The app folder when this process runs an app from `acryl new`, else undefined. */
export function appHomeDir() {
  return active.appHome
}

/** Does this real path sit in some project extensions folder (classic or instance-namespaced)? */
export function isProjectExtensionPath(path) {
  const slashed = path.replaceAll('\\', '/')
  return slashed.includes('/.acryl-extensions/') || /\/\.acryl\/instances\/[^/]+\/extensions\//u.test(slashed)
}

/** How the router names the project location the agent writes to. */
export function projectExtensionsLabel(instance = currentInstance()) {
  return instance === undefined ? '<workspace>/.acryl-extensions/<name>/' : `<workspace>/.acryl/instances/${instance}/extensions/<name>/`
}

/**
 * An app created by `acryl new` is its own ACRYL home (it has `blend.yaml`). Its plugins belong in `<app>/extensions/`, the home's extension scope, so they
 * load at every start and are committed with the app. Returns that folder, or undefined outside an app.
 */
export function appExtensionsDir() {
  return active.appHome === undefined ? undefined : join(active.appHome, 'extensions')
}
