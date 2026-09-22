import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('..', import.meta.url))
const bundlePath = join(root, 'lib/client.js')

/** Every file the bundle is built from, so a stale artifact cannot pass as a verified one. */
function builtFrom(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? builtFrom(path) : [path]
  }).filter(file => /\.(?:ts|tsx|css)$/u.test(file))
}
const sourceFiles = builtFrom(join(root, 'src/client'))

/**
 * Sources newer than the bundle. Absent artifact is reported by `pnpm run verify:artifact` in the
 * gate rather than here, because a bare `vitest run` on a fresh clone legitimately has no build; but
 * a *stale* artifact must never read as green - that is how a served @acryl/ui without its newest
 * components reached the app during T045 while these tests passed.
 */
function staleSources(): string[] {
  if (!existsSync(bundlePath)) return []
  const bundleMtime = statSync(bundlePath).mtimeMs
  return sourceFiles.filter(file => statSync(file).mtimeMs > bundleMtime).map(file => file.slice(root.length + 1))
}

const contract = JSON.parse(readFileSync(join(root, 'contracts/components.json'), 'utf8')) as {
  components: Record<string, { surfaces: string[] }>
  helpers: Record<string, unknown>
  reexports: { names: string[] }
}
const require = createRequire(import.meta.url)

interface LoadedModule { id: string, exports: Record<string, unknown>, styleTags: Array<{ plugin: string, pluginCss: string, text: string }> }

/** Evaluate the BUILT lib/client.js the way the client module loader does: react is real, the app's primitives are stubs, `document` records the style tags. */
function loadBuilt(): LoadedModule {
  let registered: { id: string, factory: (req: (name: string) => unknown) => Record<string, unknown> } | undefined
  const styleTags: LoadedModule['styleTags'] = []
  const document = {
    querySelector: () => null,
    createElement: () => { const tag = { dataset: {} as Record<string, string>, textContent: '' }; return tag },
    head: { appendChild: (tag: { dataset: Record<string, string>, textContent: string }) => { styleTags.push({ plugin: tag.dataset.plugin ?? '', pluginCss: tag.dataset.pluginCss ?? '', text: tag.textContent }) } },
  }
  const primitives = new Proxy({}, { get: (_t, key) => (key === '__esModule' ? false : () => null) })
  const window = { __ModuleLoader__: { load: (entry: typeof registered) => { registered = entry } } }
  new Function('window', 'document', readFileSync(bundlePath, 'utf8'))(window, document)
  if (registered === undefined) throw new Error('the bundle did not call __ModuleLoader__.load')
  const exports = registered.factory(name => (name === 'react' ? require('react') : name === 'react/jsx-runtime' ? require('react/jsx-runtime') : name === '@deepseek-ai/dsh-client-ui-primitives' ? primitives : (() => { throw new Error(`unexpected require ${name}`) })()))
  return { id: registered.id, exports, styleTags }
}

describe.skipIf(!existsSync(bundlePath))('the built lib/client.js (run `pnpm run build` first)', () => {
  it('is not older than the sources it was built from', () => {
    const stale = staleSources()
    expect(stale, `lib/client.js is older than ${stale.length} source file(s) (${stale.slice(0, 5).join(', ')}): rebuild before trusting the assertions below`).toEqual([])
  })

  it('registers under the package name and requires only react and the app primitives from the loader', () => {
    const { id } = loadBuilt()
    expect(id).toBe('@acryl/ui')
    const source = readFileSync(bundlePath, 'utf8')
    expect([...source.matchAll(/require\("([^"]+)"\)/gu)].map(m => m[1]).sort()).toEqual(['@deepseek-ai/dsh-client-ui-primitives', 'react', 'react/jsx-runtime'])
  })

  it('exports exactly the contracted components, helpers and re-exports, plus apply, inject, roles and version', () => {
    const { exports } = loadBuilt()
    const webComponents = Object.entries(contract.components).filter(([, c]) => c.surfaces.includes('web')).map(([name]) => name)
    // Composite items export named sub-parts alongside their headline name (their own contract
    // entry is the whole composite, e.g. "Breadcrumb" covers BreadcrumbList/Item/Link/... too).
    const compositeSubExports = ['BreadcrumbList', 'BreadcrumbItem', 'BreadcrumbLink', 'BreadcrumbPage', 'BreadcrumbSeparator', 'BreadcrumbEllipsis', 'AccordionItem', 'AccordionTrigger', 'AccordionContent', 'ButtonGroupText', 'ButtonGroupSeparator', 'CollapsibleTrigger', 'CollapsibleContent', 'ToggleGroupItem', 'TableHeader', 'TableBody', 'TableFooter', 'TableRow', 'TableHead', 'TableCell', 'TableCaption', 'DirectionProvider', 'useDirection', 'MarkerIcon', 'MarkerContent', 'MessageGroup', 'MessageAvatar', 'MessageContent', 'MessageHeader', 'MessageFooter', 'BubbleGroup', 'BubbleContent', 'BubbleReactions', 'PaginationContent', 'PaginationItem', 'PaginationLink', 'PaginationPrevious', 'PaginationNext', 'PaginationEllipsis', 'NativeSelectOption', 'NativeSelectOptGroup', 'InputOTPGroup', 'InputOTPSlot', 'InputOTPSeparator', 'ItemGroup', 'ItemSeparator', 'ItemMedia', 'ItemContent', 'ItemTitle', 'ItemDescription', 'ItemActions', 'ItemHeader', 'ItemFooter', 'AttachmentGroup', 'AttachmentMedia', 'AttachmentContent', 'AttachmentTitle', 'AttachmentDescription', 'AttachmentActions', 'AttachmentAction', 'AttachmentTrigger', 'InputGroupAddon', 'InputGroupButton', 'InputGroupText', 'InputGroupInput', 'InputGroupTextarea', 'FieldSet', 'FieldLegend', 'FieldGroup', 'FieldContent', 'FieldLabel', 'FieldTitle', 'FieldDescription', 'FieldSeparator', 'FieldError', 'PopoverTrigger', 'PopoverAnchor', 'PopoverContent', 'PopoverHeader', 'PopoverTitle', 'PopoverDescription', 'SheetTrigger', 'SheetClose', 'SheetOverlay', 'SheetContent', 'SheetHeader', 'SheetFooter', 'SheetTitle', 'SheetDescription']
    const expected = new Set([...webComponents, ...Object.keys(contract.helpers), ...contract.reexports.names, 'apply', 'inject', 'roles', 'version', 'ValueField', 'SecretField', 'AppearanceCubes', 'SelectPill', ...compositeSubExports])
    for (const name of webComponents) expect(typeof exports[name], name).toBe('function')
    for (const name of Object.keys(contract.helpers)) expect(typeof exports[name], name).toBe('function')
    expect(typeof exports.apply).toBe('function')   // the client loader treats every module as a plugin
    expect(Object.keys(exports).filter(k => !expected.has(k) && k !== '__esModule')).toEqual([])
  })

  it('CSS is compiled by the DSH mechanism: one plugin-owned style tag per module stylesheet, hashed class names, nothing global', () => {
    const { styleTags } = loadBuilt()
    expect(styleTags.length).toBeGreaterThanOrEqual(8)
    for (const tag of styleTags) {
      expect(tag.plugin).toBe('@acryl/ui'); expect(tag.pluginCss).toMatch(/^@acryl\/ui\/[A-Za-z]+\.module\.css$/u)
      expect(tag.text).not.toMatch(/(^|\})\s*(body|html|:root)\s*\{/u)   // no global selectors
      expect(tag.text).toMatch(/\.[A-Za-z0-9_-]{5,}_[a-zA-Z]+/u)   // [hash]_[local]
    }
    expect(new Set(styleTags.map(t => t.pluginCss)).size).toBe(styleTags.length)
  })

  it('apply registers the two extra tokens with the theme service (light and dark) and removes them with the plugin', () => {
    const { exports } = loadBuilt()
    const registered: Array<{ source: string, tokens: Record<string, { light: string, dark: string }> }> = []
    let disposed = 0
    const ctx = { theme: { overrideTokens: (source: string, tokens: Record<string, { light: string, dark: string }>) => { registered.push({ source, tokens }); return () => { disposed += 1 } } }, effect: (fn: () => () => void) => fn() }
    ;(exports.apply as (c: unknown) => void)(ctx)
    expect(registered).toHaveLength(1); expect(registered[0]?.source).toBe('@acryl/ui')
    expect(Object.keys(registered[0]?.tokens ?? {}).sort()).toEqual(['--acryl-accent', '--acryl-reasoning'])
    for (const pair of Object.values(registered[0]?.tokens ?? {})) { expect(pair.light).toMatch(/^#[0-9A-Fa-f]{6}$/u); expect(pair.dark).toMatch(/^#[0-9A-Fa-f]{6}$/u) }
    expect(disposed).toBe(0)
    ;(exports.apply as (c: unknown) => void)({})   // a client without a theme service is not an error
  })
})
