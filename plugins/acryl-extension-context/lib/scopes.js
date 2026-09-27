/**
 * Where an ACRYL instance keeps what it authors inside a project (spec 036, "Many instances").
 *
 * An unnamed ACRYL (the main app) keeps the classic shared locations: `<workspace>/.acryl-extensions/` and `<workspace>/.acryl/blend/`, which belong to the project
 * and can be committed. A NAMED instance (`ACRYL_INSTANCE`, set by the launcher) must never leak into, or load from, another instance that happens to open the same
 * folder, so everything it authors lives under `<workspace>/.acryl/instances/<name>/`. Two Blends opening one project then see only their own extensions, their
 * own captured Blend and their own ledger. The instance-wide (global) scope is already private, because it lives under that instance's own ACRYL home.
 */
import { join } from 'node:path'

const NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u

/** The named instance this process runs as, or undefined for the main app. An invalid name is ignored, never used to build a path. */
export function currentInstance(env = process.env) {
  const value = env.ACRYL_INSTANCE
  return typeof value === 'string' && value.length <= 32 && NAME.test(value) ? value : undefined
}

function instanceRoot(workspaceDir, instance) {
  return join(workspaceDir, '.acryl', 'instances', instance)
}

/** Project-scope extensions folder. */
export function projectExtensionsDir(workspaceDir, instance = currentInstance()) {
  return instance === undefined ? join(workspaceDir, '.acryl-extensions') : join(instanceRoot(workspaceDir, instance), 'extensions')
}

/** Captured Blend folder (manifest, lock, vendored sources, ledger). */
export function blendDir(workspaceDir, instance = currentInstance()) {
  return instance === undefined ? join(workspaceDir, '.acryl', 'blend') : join(instanceRoot(workspaceDir, instance), 'blend')
}

/** Does this real path sit in some project extensions folder (classic or instance-namespaced)? */
export function isProjectExtensionPath(path) {
  return path.includes('/.acryl-extensions/') || /\/\.acryl\/instances\/[^/]+\/extensions\//u.test(path)
}

/** How the router names the project location the agent writes to. */
export function projectExtensionsLabel(instance = currentInstance()) {
  return instance === undefined ? '<workspace>/.acryl-extensions/<name>/' : `<workspace>/.acryl/instances/${instance}/extensions/<name>/`
}
