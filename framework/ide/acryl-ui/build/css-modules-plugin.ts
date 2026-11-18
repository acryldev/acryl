/**
 * CSS Modules step of the DSH client build, copied from packages/client/tsdown.client.ts (plugin `dsh-css-modules-inline` and `styleInjectionModule`, pinned deepseek-harness
 * 5dda764ed3). DSH does not export it (its `clientBundle` preset looks the package up in DSH's own workspace), and the doc it is described in
 * (docs/ui-design-styling-sytem/dsh-ui-styling-system-libs-styling-ui-tech-stack.md, sections 2, 3, 15) requires the same output: a `*.module.css` import becomes Lightning CSS output
 * with `[hash]_[local]` class names plus a class map, and the CSS is mounted as a plugin-owned `<style data-plugin data-plugin-css>` tag. Behavior is unchanged from the original;
 * only the virtual-module plumbing is condensed. Replace this file with an import if DSH ever exports the plugin.
 */
import { readFile } from 'node:fs/promises'
import { basename, resolve, dirname } from 'node:path'
import { transform } from 'lightningcss'

const PREFIX = '\0dsh-css:'
const SUFFIX = '.mjs'

/** Emit one plugin-owned style injector and the CSS Modules export (identical to DSH's `styleInjectionModule`). */
function styleInjectionModule(id: string, fileId: string, css: string, classMap: Readonly<Record<string, string>>): string {
  return [
    `const css = ${JSON.stringify(css)};`,
    `const tagId = ${JSON.stringify(`${id}/${basename(fileId)}`)};`,
    'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-plugin-css=\' + JSON.stringify(tagId) + \']\') === null) {',
    '  const tag = document.createElement(\'style\');',
    `  tag.dataset.plugin = ${JSON.stringify(id)};`,
    '  tag.dataset.pluginCss = tagId;',
    '  tag.textContent = css;',
    '  document.head.appendChild(tag);',
    '}',
    `export default ${JSON.stringify(classMap)};`,
  ].join('\n')
}

/**
 * The rolldown plugin.
 * @param id - plugin id (package name), stamped onto the style tags.
 * @returns the plugin object for tsdown's `plugins` option.
 */
export function cssModulesInline(id: string) {
  return {
    name: 'dsh-css-modules-inline',
    resolveId(source: string, importer: string | undefined): string | null {
      if (!source.endsWith('.module.css')) return null
      const absolute = importer === undefined ? source : resolve(dirname(importer.replace(/^\0dsh-css:/u, '')), source)
      return PREFIX + absolute + SUFFIX
    },
    async load(virtualId: string): Promise<string | null> {
      if (!virtualId.startsWith(PREFIX)) return null
      const fileId = virtualId.slice(PREFIX.length, -SUFFIX.length)
      const { code, exports: cssExports } = transform({ filename: fileId, code: await readFile(fileId), cssModules: { pattern: '[hash]_[local]' }, minify: true })
      const classMap: Record<string, string> = {}
      for (const [local, exp] of Object.entries(cssExports ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) classMap[local] = exp.name
      return styleInjectionModule(id, fileId, code.toString(), classMap)
    },
  }
}
