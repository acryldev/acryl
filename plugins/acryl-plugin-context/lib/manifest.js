/**
 * The extension manifest is the `acryl` block of the extension's package.json (the same block the marketplace catalog reads), not a second
 * `extension.json`: two files describing one package would drift. Pi's proposed manifest fields map onto it like this:
 *
 *   acryl.apiVersion   integer, the ACRYL extension API the code was written against; refused when the runtime provides an older one
 *   acryl.permissions  what the extension needs from the machine, from a fixed vocabulary; shown to the human before a NEW extension is installed
 *   acryl.surfaces     the surfaces it is written for (validated by acryl_verify_plugin against what actually mounts)
 *
 * Permissions are DECLARATIVE: they inform the human's trust decision and are checked for honesty by review, they are not enforced by a sandbox.
 */
export const EXTENSION_API_VERSION = 1

/** The permission vocabulary. Anything else is a lint error, so a typo cannot pass as "declared". */
export const PERMISSIONS = Object.freeze({
  'fs.read': 'read files outside its own folder',
  'fs.write': 'write files outside its own folder (including the workspace)',
  net: 'make network requests',
  shell: 'run commands or child processes',
  secrets: 'read credentials or API keys',
  ui: 'add UI to the app (client code runs in the browser page)',
})

/** What the package declares, without judging it: `permissions` is undefined when the package says nothing. */
export function readManifest(pkg) {
  const block = pkg?.acryl
  if (block === null || typeof block !== 'object') return { apiVersion: undefined, permissions: undefined }
  return {
    apiVersion: block.apiVersion,
    permissions: Array.isArray(block.permissions) ? block.permissions.filter(item => typeof item === 'string') : undefined,
  }
}

/** Lint errors for the manifest fields this module owns (the marketplace fields are checked by publish.js). */
export function checkManifest(pkg) {
  const errors = []
  const block = pkg?.acryl
  if (block === undefined) return errors
  if (block === null || typeof block !== 'object') return ['"acryl" must be an object']
  if (block.apiVersion !== undefined) {
    if (!Number.isInteger(block.apiVersion) || block.apiVersion < 1) errors.push('"acryl.apiVersion" must be a positive integer')
    else if (block.apiVersion > EXTENSION_API_VERSION) errors.push(`this extension needs ACRYL extension API version ${block.apiVersion}, this runtime provides ${EXTENSION_API_VERSION}: update ACRYL or lower "acryl.apiVersion" if the code does not need the newer API`)
  }
  if (block.permissions !== undefined) {
    if (!Array.isArray(block.permissions)) errors.push('"acryl.permissions" must be an array')
    else for (const permission of block.permissions) {
      if (!(typeof permission === 'string' && Object.hasOwn(PERMISSIONS, permission))) errors.push(`unknown permission ${JSON.stringify(permission)}; use one of: ${Object.keys(PERMISSIONS).join(', ')}`)
    }
  }
  return errors
}

/** One line for the human's trust decision, e.g. `requests: shell, net` or `declares no permissions`. */
export function describePermissions(permissions) {
  if (permissions === undefined) return 'declares no permissions (unknown)'
  return permissions.length === 0 ? 'requests no special permissions' : `requests: ${permissions.join(', ')}`
}
