#!/usr/bin/env node
/**
 * Convert a pnpm `deploy --legacy` node_modules into a flat, symlink-free
 * hoisted tree.
 *
 * pnpm deploy writes an isolated layout: all packages live under
 * `node_modules/.pnpm/<entry>/node_modules/<pkg>` and the top-level
 * `node_modules/<pkg>` are relative symlinks into that store. Tar.gz archives
 * preserve those symlinks, but ZIP archives (and Windows Explorer / PowerShell
 * and several unzip builds) do not — extraction then leaves dangling links and
 * bare-specifier resolution fails (`ERR_MODULE_NOT_FOUND`). A portable CLI
 * archive must therefore carry a layout that survives any extractor.
 *
 * This flattens the store into a classic hoisted `node_modules` where every
 * package is physically present at its path and there are no symlinks. It
 * copies each store package's contents (skipping the pnpm virtual `node_modules`
 * link layer, since hoisting already places the deps at the top level) to the
 * top level, dedups by package name, then removes the `.pnpm` store.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'

/** Copy a directory tree, resolving symlinks and skipping a named child. */
function copyTree(from, to, skipNames) {
  const st = statSync(from)
  if (st.isSymbolicLink()) {
    // Resolve the symlink and copy its target content.
    const resolved = realpathSync(from)
    return copyTree(resolved, to, skipNames)
  }
  if (!st.isDirectory()) {
    mkdirSync(dirname(to), { recursive: true })
    copyFileSync(from, to)
    return
  }
  mkdirSync(to, { recursive: true })
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (skipNames.has(entry.name)) continue
    copyTree(join(from, entry.name), join(to, entry.name), skipNames)
  }
}

/** Collect every store package `{ name, sourceDir }` from `node_modules/.pnpm`. */
function collectStorePackages(moduleRoot) {
  const pnpmStore = join(moduleRoot, '.pnpm')
  const packages = new Map()
  if (!existsSync(pnpmStore)) return packages

  for (const storeEntry of readdirSync(pnpmStore, { withFileTypes: true })) {
    if (!storeEntry.isDirectory()) continue
    const storeNodeModules = join(pnpmStore, storeEntry.name, 'node_modules')
    if (!existsSync(storeNodeModules)) continue
    for (const entry of readdirSync(storeNodeModules, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue
      if (entry.name.startsWith('@')) {
        const scopeDir = join(storeNodeModules, entry.name)
        if (!existsSync(scopeDir)) continue
        for (const scoped of readdirSync(scopeDir, { withFileTypes: true })) {
          if (scoped.isSymbolicLink()) continue
          const name = `${entry.name}/${scoped.name}`
          const source = join(scopeDir, scoped.name)
          if (!existsSync(join(source, 'package.json'))) continue
          // Keep the first instance of a name; the deployed graph is coherent.
          if (!packages.has(name)) packages.set(name, source)
        }
      } else {
        const name = entry.name
        const source = join(storeNodeModules, name)
        if (!existsSync(join(source, 'package.json'))) continue
        if (!packages.has(name)) packages.set(name, source)
      }
    }
  }
  return packages
}

/** Remove every symlink in the module tree, replacing file symlinks with copies. */
function removeAllSymlinks(root) {
  if (!existsSync(root)) return
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isSymbolicLink()) {
      const target = realpathSync(path)
      rmSync(path, { force: true })
      copyTree(target, path, new Set())
    } else if (entry.isDirectory()) {
      removeAllSymlinks(path)
    }
  }
}

/**
 * Flatten `moduleRoot/node_modules` (a pnpm isolated deploy) to a hoisted,
 * symlink-free layout in place.
 * @param moduleRoot - directory containing the `node_modules` to flatten.
 */
export function flattenNodeModules(moduleRoot) {
  const moduleDir = join(moduleRoot, 'node_modules')
  if (!existsSync(join(moduleDir, '.pnpm'))) return

  const storePackages = collectStorePackages(moduleDir)
  const skipDeps = new Set(['node_modules'])
  for (const [name, source] of storePackages) {
    const dest = join(moduleDir, ...name.split(sep).join('/').split('/'))
    rmSync(dest, { recursive: true, force: true })
    copyTree(source, dest, skipDeps)
  }

  rmSync(join(moduleDir, '.pnpm'), { recursive: true, force: true })
  removeAllSymlinks(moduleDir)
}

const invokedPath = process.argv[1]
if (invokedPath !== undefined && realpathSync(invokedPath) === realpathSync(process.argv[1] ?? '')) {
  const root = process.argv[2]
  if (root === undefined) {
    console.error('usage: flatten-node-modules <archiveDir>')
    process.exit(1)
  }
  flattenNodeModules(root)
  console.log(`flattened ${root}/node_modules to a hoisted, symlink-free layout`)
}
