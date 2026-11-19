import { readFileSync } from 'node:fs'
import { defineConfig } from 'tsdown'

/** The package's importable files, exactly as `plugin.json`'s `entries` names them (the copy path uses the same table). */
const { entries } = JSON.parse(readFileSync(new URL('./plugin.json', import.meta.url), 'utf8')) as {
  entries: Record<string, string>
}
const entry = Object.fromEntries(
  Object.entries(entries).map(([, file]) => [file.replace(/.ts$/, ''), file]),
)

export default defineConfig({
  name: 'acryl-desktop-web',
  entry,
  outDir: 'lib',
  format: 'esm',
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: true,
  sourcemap: true,
  external: ['electron'],
})
