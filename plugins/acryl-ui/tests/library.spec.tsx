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
import { ScrollArea } from '../src/client/registry/ScrollArea/ScrollArea.tsx'
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from '../src/client/registry/InputOTP/InputOTP.tsx'
import { Item, ItemSeparator, ItemMedia, ItemContent, ItemTitle, ItemDescription } from '../src/client/registry/Item/Item.tsx'
import { Attachment, AttachmentMedia, AttachmentContent, AttachmentTitle, AttachmentTrigger } from '../src/client/registry/Attachment/Attachment.tsx'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupText, InputGroupInput } from '../src/client/registry/InputGroup/InputGroup.tsx'
import { FormField, FieldLabel, FieldContent, FieldDescription, FieldError } from '../src/client/registry/FormField/FormField.tsx'
import { Popover, PopoverTrigger, PopoverContent, PopoverTitle } from '../src/client/registry/Popover/Popover.tsx'
import { Slider } from '../src/client/registry/Slider/Slider.tsx'
import { Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription } from '../src/client/registry/Sheet/Sheet.tsx'
import { Drawer, DrawerTrigger, DrawerClose, DrawerContent, DrawerHeader, DrawerFooter, DrawerTitle, DrawerDescription } from '../src/client/registry/Drawer/Drawer.tsx'
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator } from '../src/client/registry/Command/Command.tsx'
import { Combobox, ComboboxInput, ComboboxTrigger, ComboboxClear, ComboboxContent, ComboboxList, ComboboxGroup, ComboboxLabel, ComboboxEmpty, ComboboxSeparator, ComboboxItem } from '../src/client/registry/Combobox/Combobox.tsx'
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuCheckboxItem, ContextMenuRadioGroup, ContextMenuRadioItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuShortcut, ContextMenuGroup } from '../src/client/registry/ContextMenu/ContextMenu.tsx'

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

describe('markup of the shadcn/ui ports (spec 038-ui-component-library, T045 batch 2: ScrollArea, InputOTP, Item, Attachment, InputGroup, FormField)', () => {
  it('ScrollArea passes its props to the scroll root - the element a caller has to give a height', () => {
    // The real-browser check caught a first pass that forwarded only `className`: the viewport then grew to its
    // content (414px) instead of scrolling inside a 120px box, because a percentage height with no definite
    // parent resolves to auto. This is the assertion that would have caught it without a browser.
    const html = renderToStaticMarkup(<ScrollArea style={{ height: 120 }} className="custom">content</ScrollArea>)
    expect(html).toMatch(/^<div[^>]*data-slot="scroll-area"[^>]*style="height:120px"[^>]*>/u)
    expect(html).toContain('custom')
    expect(html).toContain('data-slot="scroll-area-viewport"'); expect(html).toContain('tabindex="0"')
    expect(html).not.toMatch(/\boverflow-auto\b|\brounded-\[inherit\]\b/u)
  })

  it('InputOTP is one numeric input over the slots, with the OTP semantics the platform needs', () => {
    const html = renderToStaticMarkup(
      <InputOTP value="12" onChange={() => {}} maxLength={6} label="Verification code">
        <InputOTPGroup><InputOTPSlot index={0} /><InputOTPSlot index={1} /><InputOTPSlot index={2} /></InputOTPGroup>
        <InputOTPSeparator />
      </InputOTP>,
    )
    // renderToStaticMarkup writes these three in React's own camelCase; the live DOM values
    // (inputmode/autocomplete/maxlength) were confirmed in a real browser.
    expect(html).toContain('inputMode="numeric"'); expect(html).toContain('autoComplete="one-time-code"')
    expect(html).toContain('aria-label="Verification code"'); expect(html).toContain('maxLength="6"')
    expect(html.match(/data-slot="input-otp-slot"/gu)).toHaveLength(3)
    expect(html).toContain('role="separator"'); expect(html).toContain('>1<'); expect(html).toContain('>2<')
  })

  it('Item and Attachment carry the attributes their stylesheets key off, and no Tailwind classes', () => {
    const item = renderToStaticMarkup(
      <Item variant="outline" size="sm"><ItemMedia variant="icon">m</ItemMedia><ItemContent><ItemTitle>T</ItemTitle><ItemDescription>D</ItemDescription></ItemContent></Item>,
    )
    expect(item).toMatch(/data-slot="item"[^>]*data-variant="outline"[^>]*data-size="sm"/u)
    expect(item).toContain('data-slot="item-description"')
    expect(item).not.toMatch(/\bflex-wrap\b|\btext-muted-foreground\b|\bline-clamp-2\b/u)
    const chip = renderToStaticMarkup(
      <Attachment state="uploading" size="xs" orientation="vertical">
        <AttachmentMedia />
        <AttachmentContent><AttachmentTitle>f</AttachmentTitle></AttachmentContent>
        <AttachmentTrigger label="Open f" />
      </Attachment>,
    )
    expect(chip).toMatch(/data-slot="attachment"[^>]*data-state="uploading"[^>]*data-orientation="vertical"/u)
    expect(chip).toContain('aria-label="Open f"'); expect(chip).toContain('type="button"')
  })

  it('ItemSeparator is a local decorative rule, not this library Separator item', () => {
    const sep = renderToStaticMarkup(<ItemSeparator />)
    expect(sep).toContain('role="none"'); expect(sep).toMatch(/class="[^"]+"/u)
    expect(sep).not.toContain('data-orientation')   // that attribute belongs to the Separator item this must not import
  })

  it('InputGroup groups the control with its addons and marks the control its rules key off', () => {
    const html = renderToStaticMarkup(
      <InputGroup>
        <InputGroupAddon><InputGroupText>https://</InputGroupText></InputGroupAddon>
        <InputGroupInput defaultValue="x" aria-label="URL" />
        <InputGroupAddon align="inline-end"><InputGroupButton label="Copy">Copy</InputGroupButton></InputGroupAddon>
      </InputGroup>,
    )
    expect(html).toContain('role="group"'); expect(html).toContain('data-slot="input-group-control"')
    expect(html).toContain('data-align="inline-end"'); expect(html).toContain('aria-label="Copy"')
    expect(html).not.toMatch(/\brounded-none\b|\bborder-0\b|\bflex-1\b/u)
  })

  it('FormField renders its parts, and FieldError appears only when there is an error to show', () => {
    const clean = renderToStaticMarkup(
      <FormField><FieldLabel>L</FieldLabel><FieldContent><FieldDescription>d</FieldDescription><FieldError errors={[]} /></FieldContent></FormField>,
    )
    expect(clean).toContain('role="group"'); expect(clean).toContain('data-orientation="vertical"'); expect(clean).toContain('data-invalid="false"')
    expect(clean).not.toContain('role="alert"')
    const bad = renderToStaticMarkup(<FormField orientation="horizontal" invalid><FieldError errors={[{ message: 'too long' }]} /></FormField>)
    expect(bad).toContain('data-orientation="horizontal"'); expect(bad).toContain('data-invalid="true"')
    expect(bad).toMatch(/role="alert"[^>]*>too long/u)
    const many = renderToStaticMarkup(<FieldError errors={[{ message: 'a' }, { message: 'b' }, { message: 'a' }]} />)
    expect(many).toContain('<ul'); expect(many.match(/<li/gu)).toHaveLength(2)   // duplicates collapse to the distinct messages
  })
})

describe('markup of the shadcn/ui ports (spec 038-ui-component-library, T045 batch 3: Popover, Slider)', () => {
  it('Popover renders its trigger always, and its panel only while open', () => {
    const closed = renderToStaticMarkup(
      <Popover><PopoverTrigger label="Notifications">Notifications</PopoverTrigger><PopoverContent label="Notification settings"><PopoverTitle>Notifications</PopoverTitle></PopoverContent></Popover>,
    )
    expect(closed).toContain('data-slot="popover-trigger"')
    expect(closed).toContain('aria-haspopup="dialog"'); expect(closed).toContain('aria-expanded="false"')
    expect(closed).not.toContain('data-slot="popover-content"')

    const open = renderToStaticMarkup(
      <Popover open><PopoverTrigger>Notifications</PopoverTrigger><PopoverContent label="Notification settings"><PopoverTitle>Notifications</PopoverTitle></PopoverContent></Popover>,
    )
    expect(open).toContain('data-slot="popover-content"')
    expect(open).toContain('role="dialog"'); expect(open).toContain('aria-label="Notification settings"')
    expect(open).toContain('aria-expanded="true"'); expect(open).toContain('tabindex="-1"')
  })

  it('Slider renders one thumb per value with the slider role and its value attributes', () => {
    const one = renderToStaticMarkup(<Slider value={40} label="Volume" />)
    expect(one).toContain('data-slot="slider"'); expect(one).toContain('data-slot="slider-track"'); expect(one).toContain('data-slot="slider-range"')
    expect(one.match(/data-slot="slider-thumb"/gu)).toHaveLength(1)
    expect(one).toContain('role="slider"'); expect(one).toContain('aria-valuenow="40"')
    expect(one).toContain('aria-valuemin="0"'); expect(one).toContain('aria-valuemax="100"'); expect(one).toContain('aria-orientation="horizontal"')

    const range = renderToStaticMarkup(<Slider value={[20, 80]} step={5} label="Band" />)
    expect(range.match(/data-slot="slider-thumb"/gu)).toHaveLength(2)
    expect(range.match(/aria-valuenow="(20|80)"/gu)).toHaveLength(2)
    expect(range).toContain('left:20%'); expect(range).toContain('width:60%')   // the range fill spans lowest to highest
  })

  it('a disabled Slider takes its thumbs out of the tab order', () => {
    const html = renderToStaticMarkup(<Slider value={40} disabled label="Volume" />)
    expect(html).toContain('data-disabled="true"'); expect(html).toContain('aria-disabled="true"'); expect(html).toContain('tabindex="-1"')
  })
})

describe('markup of the shadcn/ui ports (spec 038-ui-component-library, T045 batch 4: Sheet)', () => {
  it('Sheet renders its trigger always, and the overlay and panel only while open', () => {
    const closed = renderToStaticMarkup(
      <Sheet><SheetTrigger label="Open sheet">Open</SheetTrigger><SheetContent label="Filters">content</SheetContent></Sheet>,
    )
    expect(closed).toContain('data-slot="sheet-trigger"'); expect(closed).toContain('aria-haspopup="dialog"'); expect(closed).toContain('aria-expanded="false"')
    expect(closed).not.toContain('data-slot="sheet-content"'); expect(closed).not.toContain('data-slot="sheet-overlay"')

    const open = renderToStaticMarkup(
      <Sheet open>
        <SheetTrigger>Open</SheetTrigger>
        <SheetContent side="left" label="Filters">
          <SheetHeader><SheetTitle>Filters</SheetTitle><SheetDescription>Narrow the list.</SheetDescription></SheetHeader>
          <SheetFooter>actions</SheetFooter>
        </SheetContent>
      </Sheet>,
    )
    expect(open).toContain('data-slot="sheet-overlay"')
    expect(open).toContain('role="dialog"'); expect(open).toContain('aria-modal="true"'); expect(open).toContain('aria-label="Filters"')
    expect(open).toContain('data-side="left"'); expect(open).toContain('tabindex="-1"')
    expect(open).toContain('data-slot="sheet-title"'); expect(open).toContain('data-slot="sheet-description"')
    expect(open).toContain('aria-label="Close"')   // the built-in close button
    expect(open).not.toMatch(/\binset-y-0\b|\bbg-black\/50\b|\bw-3\/4\b/u)
  })

  it('SheetContent can omit its close button, and SheetClose dismisses from inside', () => {
    const html = renderToStaticMarkup(
      <Sheet open><SheetContent side="bottom" showCloseButton={false} label="Actions"><SheetClose label="Cancel">Cancel</SheetClose></SheetContent></Sheet>,
    )
    expect(html).not.toContain('aria-label="Close"')
    expect(html).toContain('data-side="bottom"'); expect(html).toContain('data-slot="sheet-close"'); expect(html).toContain('aria-label="Cancel"')
  })
})

describe('markup of the shadcn/ui ports (spec 038-ui-component-library, T045 batch 4b: Drawer)', () => {
  it('Drawer renders its trigger always, and the overlay, handle and panel only while open', () => {
    const closed = renderToStaticMarkup(
      <Drawer><DrawerTrigger label="Open drawer">Open</DrawerTrigger><DrawerContent label="Actions">body</DrawerContent></Drawer>,
    )
    expect(closed).toContain('data-slot="drawer-trigger"'); expect(closed).toContain('aria-haspopup="dialog"'); expect(closed).toContain('aria-expanded="false"')
    expect(closed).not.toContain('data-slot="drawer-content"'); expect(closed).not.toContain('data-slot="drawer-overlay"')

    const open = renderToStaticMarkup(
      <Drawer open direction="bottom">
        <DrawerTrigger>Open</DrawerTrigger>
        <DrawerContent label="Actions">
          <DrawerHeader><DrawerTitle>Actions</DrawerTitle><DrawerDescription>Pick one.</DrawerDescription></DrawerHeader>
          <DrawerFooter>buttons</DrawerFooter>
        </DrawerContent>
      </Drawer>,
    )
    expect(open).toContain('data-slot="drawer-overlay"')
    expect(open).toContain('role="dialog"'); expect(open).toContain('aria-modal="true"'); expect(open).toContain('aria-label="Actions"')
    expect(open).toContain('data-direction="bottom"'); expect(open).toContain('data-shows-handle="true"'); expect(open).toContain('data-dragging="false"')
    expect(open).toContain('data-slot="drawer-handle"'); expect(open).toContain('data-slot="drawer-title"'); expect(open).toContain('tabindex="-1"')
    expect(open).not.toMatch(/\bmax-h-\[80vh\]\b|\bbg-black\/50\b|\brounded-t-lg\b|\bgroup\/drawer-content\b/u)
  })

  it('the handle is claimed only for the horizontal edges, and can be turned off', () => {
    const right = renderToStaticMarkup(<Drawer open direction="right"><DrawerContent label="Side">body</DrawerContent></Drawer>)
    expect(right).toContain('data-direction="right"'); expect(right).toContain('data-shows-handle="false"')
    const off = renderToStaticMarkup(<Drawer open direction="bottom"><DrawerContent showHandle={false} label="No handle">body</DrawerContent></Drawer>)
    expect(off).toContain('data-shows-handle="false"')
  })

  it('DrawerClose dismisses from inside the panel', () => {
    const html = renderToStaticMarkup(
      <Drawer open><DrawerContent label="Drag"><DrawerClose label="Dismiss">Dismiss</DrawerClose></DrawerContent></Drawer>,
    )
    expect(html).toContain('data-slot="drawer-close"'); expect(html).toContain('aria-label="Dismiss"')
  })
})

describe('markup of the shadcn/ui ports (spec 038-ui-component-library, T045 batch 5a: Command)', () => {
  const menu = (
    <Command label="Commands">
      <CommandInput placeholder="Type a command" />
      <CommandList>
        <CommandGroup heading="Actions">
          <CommandItem value="New session">New session</CommandItem>
          <CommandItem value="Open settings">Open settings</CommandItem>
          {null}
        </CommandGroup>
        <CommandSeparator />
        <CommandEmpty>Nothing matches.</CommandEmpty>
      </CommandList>
    </Command>
  )

  it('Command publishes the combobox/listbox/option shape the keyboard needs', () => {
    const html = renderToStaticMarkup(menu)
    expect(html).toContain('data-slot="command"'); expect(html).toContain('role="combobox"'); expect(html).toContain('aria-label="Commands"')
    expect(html).toContain('aria-controls="')            // the root points at its list
    expect(html).toContain('data-slot="command-input"'); expect(html).toContain('role="combobox"'); expect(html).toContain('aria-autocomplete="list"')
    expect(html).toContain('role="listbox"'); expect(html).toContain('role="option"')
    expect(html).toContain('data-slot="command-group-heading"'); expect(html).toContain('role="group"')
    expect(html).toContain('role="separator"')
    expect(html).not.toMatch(/\bplaceholder:text-muted-foreground\b|\bmax-h-\[300px\]\b|\bcmdk-/u)
  })

  it('every item is visible until the registry filters it, and the empty state waits for the registry', () => {
    const html = renderToStaticMarkup(menu)
    // Registration happens in an effect, so a server render has no registry: "unknown" must mean visible, or every
    // row would be display-none on the first paint and this render would show an empty menu.
    expect(html.match(/data-hidden="false"/gu)).toHaveLength(2)
    expect(html).not.toContain('data-hidden="true"')
    expect(html).not.toContain('data-slot="command-empty"')
  })

  it('an unregistered item is not judged yet, so a query alone cannot hide it before mount', () => {
    // Filtering by query is deliberately NOT asserted here: it depends on the item registry, which only exists after
    // the mount effects have run. It is verified in a real browser instead (chromium-check9), where the effects run.
    const html = renderToStaticMarkup(
      <Command label="Commands" query="zzzz"><CommandList><CommandItem value="New session">New session</CommandItem></CommandList></Command>,
    )
    expect(html).toContain('data-hidden="false"')   // unregistered, so not judged yet
    expect(html).not.toContain('data-slot="command-empty"')
  })

  it('a disabled item reports itself to assistive tech and is skipped by the keyboard', () => {
    const html = renderToStaticMarkup(
      <Command label="Commands"><CommandList><CommandItem value="Blocked" disabled>Blocked</CommandItem></CommandList></Command>,
    )
    expect(html).toContain('data-disabled="true"'); expect(html).toContain('aria-disabled="true"')
  })
})

describe('markup of the shadcn/ui ports (spec 038-ui-component-library, T045 batch 5b: Combobox)', () => {
  const picker = (
    <Combobox open label="Workspace picker">
      <ComboboxInput placeholder="Pick one" aria-label="Workspace" />
      <ComboboxContent>
        <ComboboxList>
          <ComboboxGroup>
            <ComboboxLabel>Recent</ComboboxLabel>
            <ComboboxItem value="alpha">alpha</ComboboxItem>
            <ComboboxItem value="beta" disabled>beta</ComboboxItem>
          </ComboboxGroup>
          <ComboboxSeparator />
          <ComboboxEmpty>Nothing matches.</ComboboxEmpty>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )

  it('the field restates InputGroup chrome and carries the combobox ARIA', () => {
    const html = renderToStaticMarkup(picker)
    // The restatement is the point: these are InputGroup's own hooks, not new ones, so a caller's styles survive.
    expect(html).toContain('data-slot="combobox"'); expect(html).toContain('data-slot="input-group"')
    expect(html).toContain('data-slot="input-group-control"'); expect(html).toContain('data-slot="input-group-addon"')
    expect(html).toContain('data-align="inline-end"')
    expect(html).toContain('role="combobox"'); expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('aria-autocomplete="list"'); expect(html).toContain('aria-controls="')
    expect(html).not.toMatch(/\brounded-none\b|\bflex-1\b|\bbg-popover\b|\bmin-w-\[8rem\]\b/u)
  })

  it('the panel renders only while open, and the clear button is inert until something is chosen', () => {
    // Its own closed tree: content returns null when closed, so the item-bearing tree above would prove nothing here.
    const closed = renderToStaticMarkup(
      <Combobox><ComboboxInput aria-label="Workspace" /><ComboboxContent><ComboboxList><ComboboxItem value="alpha">alpha</ComboboxItem></ComboboxList></ComboboxContent></Combobox>,
    )
    expect(closed).not.toContain('data-slot="combobox-content"')
    expect(closed).toContain('data-slot="combobox-clear"'); expect(closed).toContain('disabled=""')
    expect(closed).toContain('data-slot="combobox-trigger"'); expect(closed).toContain('aria-haspopup="listbox"')

    const open = renderToStaticMarkup(
      <Combobox open value="alpha">
        <ComboboxInput aria-label="Workspace" />
        <ComboboxContent><ComboboxList><ComboboxItem value="alpha">alpha</ComboboxItem></ComboboxList></ComboboxContent>
      </Combobox>,
    )
    expect(open).toContain('data-slot="combobox-content"'); expect(open).toContain('data-open="true"')
    expect(open).toContain('role="listbox"')
    expect(open).toContain('data-selected="true"'); expect(open).toContain('data-slot="combobox-item-indicator"')
    expect(open).toContain('aria-expanded="true"')
  })

  it('an unregistered item is not judged yet, and a disabled one reports itself to assistive tech', () => {
    const html = renderToStaticMarkup(picker)
    // Registration runs in an effect, so "unknown" must read as visible or every row would be display-none here.
    // Asserted as separate facts rather than one tag-spanning regex: the order React writes attributes in is not
    // something an assertion should depend on (a first version of this did, and failed for that reason alone).
    expect(html.match(/data-slot="combobox-item"/gu)).toHaveLength(2)
    expect(html).toContain('data-hidden="false"')
    expect(html).not.toContain('data-hidden="true"')
    expect(html).toContain('data-disabled="true"'); expect(html).toContain('aria-disabled="true"')
    expect(html).toContain('data-slot="combobox-label"'); expect(html).toContain('role="separator"')
    expect(html).toContain('data-slot="combobox-empty"')
  })
})

describe('markup of the shadcn/ui ports (spec 038-ui-component-library, T045 batch 6a: ContextMenu)', () => {
  const menu = (
    <ContextMenu open>
      <ContextMenuTrigger><div>Right-click area</div></ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel inset>Actions</ContextMenuLabel>
        <ContextMenuGroup>
          <ContextMenuItem inset onSelect={() => {}}>Copy<ContextMenuShortcut>C</ContextMenuShortcut></ContextMenuItem>
          <ContextMenuItem variant="destructive" disabled>Delete</ContextMenuItem>
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuCheckboxItem checked onCheckedChange={() => {}}>Wrap</ContextMenuCheckboxItem>
        <ContextMenuRadioGroup value="b">
          <ContextMenuRadioItem value="a">A</ContextMenuRadioItem>
          <ContextMenuRadioItem value="b">B</ContextMenuRadioItem>
        </ContextMenuRadioGroup>
      </ContextMenuContent>
    </ContextMenu>
  )

  it('the trigger is a focusable region and the panel is a menu with menu-item roles', () => {
    const html = renderToStaticMarkup(menu)
    expect(html).toContain('data-slot="context-menu-trigger"'); expect(html).toContain('tabindex="0"')
    expect(html).toContain('role="menu"'); expect(html).toContain('tabindex="-1"')
    expect(html).toContain('role="menuitem"'); expect(html).toContain('role="menuitemcheckbox"'); expect(html).toContain('role="menuitemradio"')
    expect(html).toContain('role="group"'); expect(html).toContain('role="separator"')
    expect(html).toContain('data-slot="context-menu-shortcut"')
    expect(html).not.toMatch(/\bmin-w-\[8rem\]\b|\bbg-popover\b|\bflex-1\b/u)
  })

  it('checkbox and radio rows report their state, and inset/destructive/disabled carry through', () => {
    const html = renderToStaticMarkup(menu)
    expect(html).toContain('aria-checked="true"')                      // the checked box and the selected radio
    expect(html.match(/aria-checked="false"/gu)?.length ?? 0).toBeGreaterThanOrEqual(1)
    expect(html).toContain('data-disabled="true"'); expect(html).toContain('aria-disabled="true"')
    expect(html).toContain('data-variant="destructive"'); expect(html).toContain('data-inset="true"')
    expect(html).toContain('data-slot="context-menu-indicator"')
    expect(html.match(/data-highlighted="false"/gu)?.length ?? 0).toBeGreaterThanOrEqual(4)
  })

  it('nothing renders while closed', () => {
    const closed = renderToStaticMarkup(
      <ContextMenu><ContextMenuTrigger>area</ContextMenuTrigger><ContextMenuContent><ContextMenuItem>Copy</ContextMenuItem></ContextMenuContent></ContextMenu>,
    )
    expect(closed).toContain('data-slot="context-menu-trigger"')
    expect(closed).not.toContain('data-slot="context-menu-content"')
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
