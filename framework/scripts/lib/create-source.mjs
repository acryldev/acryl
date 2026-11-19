import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * The `--from` a packer hands to create: an existing folder as an absolute path, anything else (a registry id such as acrylblends.small-crm) as given.
 * create takes a folder source only when it is written as one (./x, ../x, /x, C:\x), so a template name is never read as a folder; a release workflow
 * passes apps/<product> bare, which create would refuse as an unknown source (product-release run 44482560217 failed that way on all six runners).
 */
export function createSource(from, cwd = process.cwd()) {
  const folder = resolve(cwd, from)
  return existsSync(folder) ? folder : from
}
