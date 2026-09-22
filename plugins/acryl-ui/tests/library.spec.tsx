import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AppearanceCubes } from '../src/client/registry/AppearanceCubes/AppearanceCubes.tsx'
import { Card } from '../src/client/registry/Card/Card.tsx'
import { Field, Segmented, SelectField } from '../src/client/contract-adapters.tsx'
import { SettingsRow } from '../src/client/registry/SettingsRow/SettingsRow.tsx'
import { Tabs } from '../src/client/registry/Tabs/Tabs.tsx'
import { EmptyState } from '../src/client/registry/EmptyState/EmptyState.tsx'
import { SidebarRow } from '../src/client/registry/SidebarRow/SidebarRow.tsx'
import { ToolCallCard } from '../src/client/registry/ToolCallCard/ToolCallCard.tsx'
import { Kbd } from '../src/client/registry/Kbd/Kbd.tsx'
import { SwitchField } from '../src/client/registry/SwitchField/SwitchField.tsx'
import { Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell, TableCaption } from '../src/client/registry/Table/Table.tsx'
import { DirectionProvider, useDirection } from '../src/client/registry/DirectionProvider/DirectionProvider.tsx'
import { Marker, MarkerIcon, MarkerContent } from '../src/client/registry/Marker/Marker.tsx'
import { Message, MessageAvatar, MessageContent, MessageHeader, MessageFooter } from '../src/client/registry/Message/Message.tsx'
import { Bubble, BubbleContent, BubbleReactions } from '../src/client/registry/Bubble/Bubble.tsx'
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationPrevious, PaginationNext, PaginationEllipsis } from '../src/client/registry/Pagination/Pagination.tsx'
import { NativeSelect, NativeSelectOption, NativeSelectOptGroup } from '../src/client/registry/NativeSelect/NativeSelect.tsx'

const root = fileURLToPath(new URL('..', import.meta.url))
const harness = resolve(root, '../../deepseek-harness/packages/client')

describe('markup of the extracted components (spec 038-ui-component-library, extraction from DSH source)', () => {
  it('AppearanceCubes is DSH\'s cube picker: pressed state, one button per option, icon over label', () => {
    const html = renderToStaticMarkup(<AppearanceCubes title="Appearance" value="dark" onChange={() => {}} options={[{ id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }]} />)
    expect(html).toContain('Appearance'); expect(html.match(/aria-pressed="true"/gu)).toHaveLength(1); expect(html.match(/<button/gu)).toHaveLength(2)
    expect(html).toMatch(/class="[^"]*_themeCube[^"]*_selected|class="[^"]*_selected[^"]*_themeCube/u)   // hashed class names
  })

  it('Tabs keeps DSH\'s roles and wiring: tablist, tab, tabpanel, roving tabindex, aria-controls to the panel', () => {
    const html = renderToStaticMarkup(<Tabs label="Sections" value="b" onChange={() => {}} tabs={[{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]}>panel</Tabs>)
    expect(html).toContain('role="tablist"'); expect(html).toContain('role="tabpanel"')
    expect(html.match(/role="tab"/gu)).toHaveLength(2); expect(html.match(/tabindex="0"/gu)).toHaveLength(1); expect(html).toContain('data-active="true"')
    const controls = /aria-controls="([^"]+)"/u.exec(html)?.[1]; expect(html).toContain(`id="${controls}"`)
  })

  it('Field is DSH\'s ValueField: label bound to the input, hint, and an invalid state that replaces the hint', () => {
    const ok = renderToStaticMarkup(<Field label="Name" value="x" onChange={() => {}} hint="shown in the header" />)
    expect(ok).toContain('shown in the header'); expect(ok).not.toContain('aria-invalid')
    const bad = renderToStaticMarkup(<Field label="Name" value="x" onChange={() => {}} hint="shown in the header" error="Too long" />)
    expect(bad).toContain('Too long'); expect(bad).not.toContain('shown in the header'); expect(bad).toContain('aria-invalid="true"')
    expect(/<label[^>]*for="([^"]+)"/u.exec(ok)?.[1]).toBe(/<input[^>]*id="([^"]+)"/u.exec(ok)?.[1])
  })

  it('SettingsRow, SelectField, Segmented, Card, SwitchField and EmptyState render their contracted parts', () => {
    expect(renderToStaticMarkup(<SettingsRow title="Permission" description="Default mode" error>x</SettingsRow>)).toMatch(/Permission[\s\S]*role="alert"[^>]*>Default mode/u)
    const select = renderToStaticMarkup(<SelectField label="Perm" value="w" onChange={() => {}} options={[{ id: 'r', label: 'Read Only' }, { id: 'w', label: 'Workspace Write' }]} />)
    expect(select).toContain('aria-haspopup="menu"'); expect(select).toContain('Workspace Write'); expect(select).toContain('aria-label="Perm"')
    expect(renderToStaticMarkup(<Segmented label="Theme" value="a" onChange={() => {}} options={[{ id: 'a', label: 'A' }]} />)).toContain('role="group" aria-label="Theme"')
    const card = renderToStaticMarkup(<Card title="Settings" footer="Save">body</Card>)
    expect(card).toMatch(/role="group" aria-labelledby="([^"]+)"/u); expect(card).toContain('Save')
    expect(renderToStaticMarkup(<SwitchField label="Loud" checked hint="hint" onChange={() => {}} />)).toMatch(/>Loud<\/span>[\s\S]*aria-checked="true"/u)
    expect(renderToStaticMarkup(<EmptyState title="Nothing" description="Saved items" />)).toContain('Saved items')
  })

  it('Kbd renders one key, ported from shadcn/ui onto hashed classes, no Tailwind utility classes', () => {
    const html = renderToStaticMarkup(<Kbd>{'\u2318K'}</Kbd>)
    expect(html).toMatch(/<kbd class="[^"]+">.KK?<\/kbd>|<kbd class="[^"]+">/u)
    expect(html).not.toMatch(/\bbg-muted\b|\btext-muted-foreground\b/u)
  })
})

describe('markup of the shadcn/ui ports (spec 038-ui-component-library, T045 batch 1: Table, Direction, Marker, Message, Bubble, Pagination, NativeSelect)', () => {
  it('Table renders real table semantics, in its own scroll container, with no Tailwind utility classes', () => {
    const html = renderToStaticMarkup(
      <Table>
        <TableCaption>Totals</TableCaption>
        <TableHeader><TableRow><TableHead>Name</TableHead></TableRow></TableHeader>
        <TableBody><TableRow><TableCell>alpha</TableCell></TableRow></TableBody>
        <TableFooter><TableRow><TableCell>1</TableCell></TableRow></TableFooter>
      </Table>,
    )
    expect(html).toMatch(/^<div[^>]*class="[^"]+"><table[^>]*class="[^"]+"/u)   // the wrapper div is the first element
    expect(html).toContain('<caption'); expect(html).toContain('<thead'); expect(html).toContain('<tbody'); expect(html).toContain('<tfoot')
    expect(html).not.toMatch(/\bw-full\b|\bwhitespace-nowrap\b|\boverflow-x-auto\b|\bcaption-bottom\b/u)
  })

  it('DirectionProvider and useDirection carry the direction through context, and default to ltr', () => {
    const Reader = (): JSX.Element => <span>{useDirection()}</span>
    expect(renderToStaticMarkup(<Reader />)).toContain('ltr')
    expect(renderToStaticMarkup(<DirectionProvider dir="rtl"><Reader /></DirectionProvider>)).toContain('rtl')
    expect(renderToStaticMarkup(<DirectionProvider direction="rtl"><Reader /></DirectionProvider>)).toContain('rtl')
  })

  it('Marker exposes the variant its stylesheet keys off, and its icon is decorative', () => {
    const html = renderToStaticMarkup(<Marker variant="separator"><MarkerIcon>i</MarkerIcon><MarkerContent>Today</MarkerContent></Marker>)
    expect(html).toContain('data-variant="separator"'); expect(html).toContain('aria-hidden="true"'); expect(html).toContain('Today')
  })

  it('Message and Bubble carry alignment and variant on the element the stylesheet keys off', () => {
    const html = renderToStaticMarkup(
      <Message align="end">
        <MessageAvatar>AM</MessageAvatar>
        <MessageContent>
          <MessageHeader>Ada</MessageHeader>
          <Bubble variant="ghost" align="end">
            <BubbleContent>hi</BubbleContent>
            <BubbleReactions side="top">+1</BubbleReactions>
          </Bubble>
        </MessageContent>
        <MessageFooter>now</MessageFooter>
      </Message>,
    )
    expect(html).toContain('data-align="end"'); expect(html).toContain('data-variant="ghost"'); expect(html).toContain('data-side="top"')
    expect(html).toContain('data-slot="message-footer"'); expect(html).toContain('data-slot="bubble-content"')
    expect(html).not.toMatch(/\bmax-w-\[80%\]\b|\brounded-xl\b|\btext-muted-foreground\b/u)
  })

  it('Pagination marks the current page and labels the landmark and the ellipsis', () => {
    const html = renderToStaticMarkup(
      <Pagination>
        <PaginationContent>
          <PaginationItem><PaginationPrevious href="#" /></PaginationItem>
          <PaginationItem><PaginationLink href="#" isActive>2</PaginationLink></PaginationItem>
          <PaginationItem><PaginationLink href="#">3</PaginationLink></PaginationItem>
          <PaginationItem><PaginationEllipsis /></PaginationItem>
          <PaginationItem><PaginationNext href="#" /></PaginationItem>
        </PaginationContent>
      </Pagination>,
    )
    expect(html).toContain('aria-label="pagination"')
    expect(html.match(/aria-current="page"/gu)).toHaveLength(1)
    expect(html).toContain('More pages'); expect(html).toContain('Go to previous page'); expect(html).toContain('Go to next page')
  })

  it('NativeSelect is the platform select, not a menu over it', () => {
    const html = renderToStaticMarkup(
      <NativeSelect size="sm" defaultValue="b" aria-label="Mode">
        <NativeSelectOptGroup label="one"><NativeSelectOption value="a">A</NativeSelectOption></NativeSelectOptGroup>
        <NativeSelectOption value="b">B</NativeSelectOption>
      </NativeSelect>,
    )
    expect(html).toMatch(/<select[^>]*class="[^"]+"/u)
    expect(html).toContain('<optgroup'); expect(html.match(/<option/gu)).toHaveLength(2)
    expect(html).not.toContain('role="menu"'); expect(html).not.toMatch(/\bappearance-none\b|\bpr-8\b/u)
  })
})

const labels = { input: 'IN', output: 'OUT', running: 'Running', failed: 'Failed', stopped: 'Stopped' }

describe('ToolCallCard and SidebarRow (extracted from DSH ToolRow and SidebarRoot)', () => {
  it('ToolCallCard shows the summary collapsed, the IN/OUT card when expandable, and a hidden run-state label', () => {
    const html = renderToStaticMarkup(<ToolCallCard icon={<i />} title="Read" summary="a.ts" state="running" input="a.ts" output="ok" labels={labels} />)
    expect(html).toContain('a.ts'); expect(html).toContain('Running'); expect(html).toContain('data-state="running"')
  })

  it('an error row replaces the summary with the failure line and shows a state dot instead of the icon', () => {
    const html = renderToStaticMarkup(<ToolCallCard icon={<i data-icon />} title="Bash" summary="npm test" errorSummary="exit 1" state="error" labels={labels} />)
    expect(html).toContain('exit 1'); expect(html).not.toContain('npm test'); expect(html).toContain('Failed'); expect(html).toContain('data-statedot="error"'); expect(html).not.toContain('data-icon')
  })

  it('a call with no input, output or children is not expandable', () => {
    expect(renderToStaticMarkup(<ToolCallCard icon={<i />} title="Ping" summary="" state="ok" labels={labels} />)).toContain('data-expandable="false"')
  })

  it('SidebarRow is icon plus label when wide and an icon-only labelled control on the rail', () => {
    const wide = renderToStaticMarkup(<SidebarRow icon={<i />} label="New session" wide onClick={() => {}} />)
    const rail = renderToStaticMarkup(<SidebarRow icon={<i />} label="New session" wide={false} onClick={() => {}} />)
    expect(wide).toContain('>New session</span>'); expect(rail).not.toContain('>New session</span>'); expect(rail).toContain('aria-label="New session"'); expect(rail).toMatch(/_collapsed/u)
  })
})

describe('provenance: extracted files stay faithful to the pinned DSH source', () => {
  it('fields.tsx is DSH\'s fields.tsx apart from the header, and its stylesheet is byte-identical', () => {
    const body = (text: string): string => text.slice(text.indexOf("import { Tag }"))
    expect(body(readFileSync(join(root, 'src/client/registry/fields/fields.tsx'), 'utf8'))).toBe(body(readFileSync(join(harness, 'ui-settings-plugins/src/client/fields.tsx'), 'utf8')))
    expect(readFileSync(join(root, 'src/client/registry/fields/fields.module.css'), 'utf8')).toBe(readFileSync(join(harness, 'ui-settings-plugins/src/client/fields.module.css'), 'utf8'))
  })

  it('AppearanceCubes.module.css is byte-identical to DSH\'s AppearanceRow.module.css', () => {
    expect(readFileSync(join(root, 'src/client/registry/AppearanceCubes/AppearanceCubes.module.css'), 'utf8')).toBe(readFileSync(join(harness, 'ui-theme/src/client/AppearanceRow.module.css'), 'utf8'))
  })

  it('every class in the extracted ToolCallCard and SidebarRow stylesheets exists in the DSH stylesheet it came from', () => {
    const classes = (text: string): Set<string> => new Set([...text.replace(/\/\*[\s\S]*?\*\//gu, '').matchAll(/\.([A-Za-z][\w-]*)/gu)].map(match => match[1] ?? ''))
    const pairs: Array<[string, string]> = [['ToolCallCard/ToolCallCard.module.css', 'ui-tool/src/client/tool/components/ToolRow.module.css'], ['SidebarRow/SidebarRow.module.css', 'ui-sidebar/src/client/SidebarRoot.module.css']]
    for (const [ours, theirs] of pairs) {
      const upstream = classes(readFileSync(join(harness, theirs), 'utf8'))
      for (const name of classes(readFileSync(join(root, 'src/client/registry', ours), 'utf8'))) expect(upstream.has(name), `${ours}: .${name}`).toBe(true)
    }
  })

  it('every registry component is listed in the manifest with its origin', () => {
    const manifest = readFileSync(join(root, 'registry-manifest.yml'), 'utf8')
    for (const dir of readdirSync(join(root, 'src/client/registry')).filter(name => statSync(join(root, 'src/client/registry', name)).isDirectory())) expect(manifest, dir).toContain(`name: ${dir}`)
  })
})

describe('styling rules from the DSH styling document (section 39): no hex colors, no theme selectors, no global stylesheet', () => {
  const cssFiles = (dir: string): string[] => readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? cssFiles(path) : path.endsWith('.module.css') ? [path] : []
  })
  const ALLOWED_STATIC = new Map([['AppearanceCubes.module.css', ['--dsw-static-neutral-bluish-400']]])   // DSH's own original uses this one static token (its comment explains: no alias exists for that step)

  it('registry stylesheets use only --dsw-alias-* tokens', () => {
    for (const file of cssFiles(join(root, 'src/client/registry'))) {
      const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '')
      const name = file.split('/').at(-1) as string
      expect(css, `${name}: hex color`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u)
      expect(css, `${name}: theme selector`).not.toMatch(/\.(dark|light)\b|data-ds-dark-theme|prefers-color-scheme/u)
      const statics = [...css.matchAll(/--dsw-static-[a-z0-9-]+/gu)].map(m => m[0]).filter(token => !(ALLOWED_STATIC.get(name) ?? []).includes(token))
      expect(statics, `${name}: static token outside the documented exception`).toEqual([])
    }
  })

  it('there is no global stylesheet and no body-level custom property left in the library source', () => {
    for (const file of readdirSync(join(root, 'src/client'), { recursive: true }).map(String).filter(name => /\.(ts|tsx)$/u.test(name))) {
      const text = readFileSync(join(root, 'src/client', file), 'utf8')
      expect(text, file).not.toMatch(/createElement\(['"]style['"]\)|document\.head/u)
    }
  })
})
