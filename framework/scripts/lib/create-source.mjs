import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * The `--from` a packer hands to create: an existing folder as an absolute path, anything else (a registry id such as acrylblends.small-crm) as given.
 * create takes a folder source only when it is written as one (./x, ../x, /x, C:\x), so a template name is never read as a folder; a release workflow
 * passes apps/<product> bare, which create would refuse as an unknown source (product-release run 44482560217 failed that way on all six runners).
 */
export function createSource(from, cwd = process.cwd()) {
  const folder = resolve(cwd, from)
  return existsSync(folder) ? folder : from
}

/**
 * What a Blend's repository carries for itself, not for the app made from it: `.github/` (its release workflow). create copies a folder source whole,
 * so the packer takes these out of the product's app and its first commit; left in, a fresh install showed the bundle's missing workflow as an unsaved
 * deletion ("v2 · 1 unsaved").
 */
export const REPOSITORY_ONLY = ['.github']

/** The repository-only paths present in an app folder. */
export function repositoryOnlyIn(app) {
  return REPOSITORY_ONLY.filter((path) => existsSync(join(app, path)))
}
