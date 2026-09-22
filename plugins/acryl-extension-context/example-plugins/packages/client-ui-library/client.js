// Example: ui-library.gallery  (browser half)
// Type:     client-slot
// Surfaces: web desktop
// Teaches:  build a Settings page (`ui.settingsSection`) from `@acryl/ui` instead of hand-styling: `require('@acryl/ui')` gives Card, Field, SwitchField, SettingsRow, SelectField,
//           Segmented, Tabs, Dialog, EmptyState, Stack, the app's Button/Tag/Pill/Toast/Modal re-exported, the semantic color roles, and slot helpers. List
//           "@acryl/ui" in `dsh.client.inject` (package.json). The library already follows light and dark; use `ui.roles.<role>` for any color of your own.
// Expect:   a "UI library" entry in the Settings screen's left navigation; its page has tabs: Components, Settings form, Conversation, Colors (DSH token names).
// Docs:     extending.ui-library
window.__ModuleLoader__.load({ id: 'acryl-example-ui-library', factory: (require) => {
var module = { exports: {} }; var exports = module.exports;

const React = require('react')
const ui = require('@acryl/ui')
const h = React.createElement
const { Stack, Card, Field, SwitchField, SettingsRow, SelectField, Segmented, Tabs, Dialog, EmptyState, Button, Tag, Pill } = ui
const { StateDot, DisclosureRow, Switch, Input, JsonTree, TerminalBlock, ReadBlock, DiffBlock, RiskConfirmation, ConnectionIndicator, WebBlock, CodeBlock, JsonBlock, MarkdownText, ReferenceIcon, LinkIcon, DocumentFileIcon } = ui
const { Badge, Skeleton, Spinner, Alert, Separator, Progress, Avatar, Label, Textarea, Checkbox, AspectRatio, Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator, Toggle, ButtonGroup, ButtonGroupText, ButtonGroupSeparator, Accordion, AccordionItem, AccordionTrigger, AccordionContent, RadioGroup, Collapsible, CollapsibleTrigger, CollapsibleContent, ToggleGroup, ToggleGroupItem } = ui
// T045 batch 1 (spec 038-ui-component-library): ported from shadcn/ui, no Radix.
const { Table, TableCaption, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell, DirectionProvider, useDirection, Marker, MarkerContent, MarkerIcon, Message, MessageGroup, MessageAvatar, MessageContent, MessageHeader, MessageFooter, Bubble, BubbleContent, BubbleReactions, Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationPrevious, PaginationNext, PaginationEllipsis, NativeSelect, NativeSelectOption } = ui
// T045 batch 2 (spec 038-ui-component-library): the items that compose shadcn siblings - resolved without a single cross-item import.
const { ScrollArea, InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator, Item, ItemGroup, ItemSeparator, ItemMedia, ItemContent, ItemTitle, ItemDescription, ItemActions, Attachment, AttachmentGroup, AttachmentMedia, AttachmentContent, AttachmentTitle, AttachmentDescription, AttachmentActions, AttachmentAction, AttachmentTrigger, InputGroup, InputGroupAddon, InputGroupButton, InputGroupText, InputGroupInput, FormField, FieldSet, FieldLegend, FieldGroup, FieldContent, FieldLabel, FieldDescription, FieldSeparator, FieldError } = ui
// T045 batch 3 (spec 038-ui-component-library): Radix overlays and input primitives rewritten by hand.
const { Popover, PopoverTrigger, PopoverContent, PopoverHeader, PopoverTitle, PopoverDescription, Slider } = ui

// Every part below is live: type, click, toggle, open. The catalogue is the point, so each entry is a working instance, not a picture.
function Section({ name, note, children }) {
  return h(Card, { title: name }, h('p', { style: { margin: '0 0 12px', color: ui.roles.textMuted, fontSize: 12 } }, note), children)
}

function Components() {
  const [name, setName] = React.useState('')
  const [on, setOn] = React.useState(true)
  const [clicks, setClicks] = React.useState(0)
  const [tab, setTab] = React.useState('one')
  const [pick, setPick] = React.useState('write')
  const [seg, setSeg] = React.useState('dark')
  const [modal, setModal] = React.useState(false)
  const [answer, setAnswer] = React.useState('nothing yet')
  return h(Stack, { gap: 'md' },
    h(Section, { name: 'Button', note: 'ui.Button: primary, ghost, disabled. Click them.' },
      h(Stack, { direction: 'row', gap: 'sm', align: 'center' },
        h(ui.Button, { variant: 'primary', size: 'sm', onClick: () => setClicks(clicks + 1) }, 'Primary (' + clicks + ')'),
        h(ui.Button, { variant: 'ghost', size: 'sm', onClick: () => setClicks(0) }, 'Reset'),
        h(ui.Button, { variant: 'primary', size: 'sm', disabled: true }, 'Disabled'))),
    h(Section, { name: 'Field and SwitchField', note: 'Type in the field; more than 12 characters shows the error state.' },
      h(Field, { label: 'Name', value: name, onChange: setName, hint: 'Shown in the header', error: name.length > 12 ? 'Too long (max 12)' : undefined }),
      h(SwitchField, { label: 'Loud mode', checked: on, onChange: setOn, hint: on ? 'On: uppercase everything' : 'Off' })),
    h(Section, { name: 'SelectField and Segmented', note: 'Open the menu; pick a tile. The value shown below each is live.' },
      h(SelectField, { label: 'Permission', value: pick, onChange: setPick, options: [{ id: 'read', label: 'Read Only' }, { id: 'write', label: 'Workspace Write' }, { id: 'full', label: 'Full access' }] }),
      h(Segmented, { title: 'Appearance', value: seg, onChange: setSeg, options: [{ id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }, { id: 'system', label: 'System' }] }),
      h('p', { style: { margin: '8px 0 0', color: ui.roles.textMuted, fontSize: 12 } }, 'permission = ' + pick + ', appearance = ' + seg)),
    h(Section, { name: 'Tabs', note: 'Arrow keys move between tabs.' },
      h(ui.Tabs, { label: 'Demo', value: tab, onChange: setTab, tabs: [{ id: 'one', label: 'One' }, { id: 'two', label: 'Two' }] }, h('p', { style: { margin: 0 } }, 'Panel ' + tab))),
    h(Section, { name: 'Tag, Pill, Tooltip', note: 'Hover the button for the tooltip.' },
      h(Stack, { direction: 'row', gap: 'sm', align: 'center' },
        h(ui.Tag, null, 'Tag'), h(ui.Pill, null, 'Pill'),
        h(ui.Tooltip, { label: 'This is a tooltip' }, h(ui.Button, { variant: 'ghost', size: 'sm' }, 'Hover me')))),
    h(Section, { name: 'Dialog', note: 'A confirm dialog over the app Modal.' },
      h(Stack, { direction: 'row', gap: 'sm', align: 'center' },
        h(ui.Button, { variant: 'primary', size: 'sm', onClick: () => setModal(true) }, 'Open dialog'),
        h('span', { style: { color: ui.roles.textMuted, fontSize: 12 } }, 'last answer: ' + answer)),
      h(Dialog, { open: modal, title: 'Delete item?', onClose: () => setModal(false), onConfirm: () => setAnswer('confirmed'), confirmLabel: 'Delete' }, 'This cannot be undone.')),
    h(EmptyState, { title: 'Nothing yet', description: 'Saved items appear here' }))
}

function Blocks2() {
  const codeLabels = { copyLabel: 'Copy', copiedLabel: 'Copied' }
  const markdownLabels = { code: codeLabels, footnotes: 'Footnotes' }
  return h(Stack, { gap: 'md' },
    h(Section, { name: 'ReferenceIcon, LinkIcon, DocumentFileIcon', note: 'Small glyphs used in mentions and attachments.' },
      h(Stack, { direction: 'row', gap: 'md', align: 'center' },
        h(ReferenceIcon, { kind: 'file' }), h(ReferenceIcon, { kind: 'folder' }), h(ReferenceIcon, { kind: 'session' }),
        h(LinkIcon, { kind: 'code' }), h(DocumentFileIcon, null))),
    h(Section, { name: 'WebBlock', note: 'A web-search result card with two sources.' },
      h(WebBlock, { kind: 'search', labels: { noResults: 'No results', sourcesTruncated: 'More sources hidden', http: 'HTTP', contentTruncated: 'Content truncated', markdown: markdownLabels }, answer: 'Cordis is a lifecycle framework.', sources: [{ url: 'https://example.test/a', title: 'Example A', snippet: 'First source.' }, { url: 'https://example.test/b', title: 'Example B' }], truncated: false })),
    h(Section, { name: 'CodeBlock and JsonBlock', note: 'Used inside MarkdownText for fenced code and JSON.' },
      h(CodeBlock, { code: 'export const x = 1', lang: 'ts' }),
      h(JsonBlock, { label: 'Payload', payload: { ok: true, count: 3 }, truncatedLabel: n => 'Truncated (' + n + ' chars)' })),
    h(Section, { name: 'MarkdownText', note: 'Full markdown rendering: headings, lists, code.' },
      h(MarkdownText, { text: '## Heading\n\nSome **bold** text and a list:\n\n- one\n- two\n\n```ts\nconst x = 1\n```', labels: markdownLabels })))
}

function ShadcnBatch3() {
  const [radio, setRadio] = React.useState('a')
  const [multi, setMulti] = React.useState(['bold'])
  return h(Stack, { gap: 'md' },
    h(Section, { name: 'RadioGroup', note: 'Classic radio dots, distinct from the tile-style AppearanceCubes.' },
      h(RadioGroup, { name: 'demo-radio', value: radio, onChange: setRadio, options: [{ id: 'a', label: 'Option A' }, { id: 'b', label: 'Option B' }, { id: 'c', label: 'Option C' }] })),
    h(Section, { name: 'Collapsible', note: 'The bare primitive: no icon or chevron chrome.' },
      h(Collapsible, { defaultOpen: false },
        h(CollapsibleTrigger, null, 'Toggle details'),
        h(CollapsibleContent, null, h('p', { style: { margin: '8px 0 0' } }, 'Plain content, no chrome.')))),
    h(Section, { name: 'ToggleGroup', note: 'Multiple selection: click to toggle bold/italic independently.' },
      h(ToggleGroup, { type: 'multiple', value: multi, onChange: setMulti },
        h(ToggleGroupItem, { value: 'bold' }, 'B'),
        h(ToggleGroupItem, { value: 'italic' }, 'I'),
        h(ToggleGroupItem, { value: 'underline' }, 'U'))))
}

function ShadcnBatch2() {
  const [checked, setChecked] = React.useState(false)
  const [pressed, setPressed] = React.useState(false)
  const [text, setText] = React.useState('')
  return h(Stack, { gap: 'md' },
    h(Section, { name: 'Label, Textarea, Checkbox', note: 'A native label, a growable textarea and a checkbox.' },
      h(Label, { htmlFor: 'demo-textarea' }, 'Notes'),
      h(Textarea, { value: text, onChange: setText, placeholder: 'Type something...' }),
      h(Checkbox, { checked, onChange: setChecked, label: 'I agree' })),
    h(Section, { name: 'Toggle', note: 'Click to press/unpress.' },
      h(Toggle, { pressed, onPressedChange: setPressed, variant: 'outline' }, pressed ? 'Pressed' : 'Not pressed')),
    h(Section, { name: 'Breadcrumb', note: 'A trail with the current page last.' },
      h(Breadcrumb, null, h(BreadcrumbList, null,
        h(BreadcrumbItem, null, h(BreadcrumbLink, { href: '#' }, 'Home')),
        h(BreadcrumbSeparator, null),
        h(BreadcrumbItem, null, h(BreadcrumbLink, { href: '#' }, 'Settings')),
        h(BreadcrumbSeparator, null),
        h(BreadcrumbItem, null, h(BreadcrumbPage, null, 'UI library'))))),
    h(Section, { name: 'AspectRatio', note: '16:9 box.' },
      h(AspectRatio, { ratio: 16 / 9 }, h('div', { style: { width: '100%', height: '100%', background: ui.roles.surfaceRaised, display: 'flex', alignItems: 'center', justifyContent: 'center' } }, '16:9'))),
    h(Section, { name: 'ButtonGroup', note: 'Corners merge between adjacent controls.' },
      h(ButtonGroup, null, h(Button, { variant: 'outline', size: 'sm' }, 'Left'), h(Button, { variant: 'outline', size: 'sm' }, 'Middle'), h(Button, { variant: 'outline', size: 'sm' }, 'Right'))),
    h(Section, { name: 'Accordion', note: 'Single mode: opening one closes the other.' },
      h(Accordion, { type: 'single' },
        h(AccordionItem, { value: 'a' }, h(AccordionTrigger, null, 'Section A'), h(AccordionContent, null, 'Content of A.')),
        h(AccordionItem, { value: 'b' }, h(AccordionTrigger, null, 'Section B'), h(AccordionContent, null, 'Content of B.')))))
}

// shadcn/ui conversions (spec 038-ui-component-library T040): ported source, no Radix or lucide-react.
function ShadcnBatch() {
  const [progress, setProgress] = React.useState(40)
  return h(Stack, { gap: 'md' },
    h(Section, { name: 'Badge', note: 'Five variants.' },
      h(Stack, { direction: 'row', gap: 'sm' },
        h(Badge, null, 'Default'), h(Badge, { variant: 'primary' }, 'Primary'), h(Badge, { variant: 'success' }, 'Success'), h(Badge, { variant: 'warning' }, 'Warning'), h(Badge, { variant: 'error' }, 'Error'))),
    h(Section, { name: 'Avatar', note: 'Falls back to initials when there is no image or it fails to load.' },
      h(Stack, { direction: 'row', gap: 'sm', align: 'center' },
        h(Avatar, { fallback: 'AM', size: 'sm' }), h(Avatar, { fallback: 'AM' }), h(Avatar, { fallback: 'AM', size: 'lg' }), h(Avatar, { src: 'https://broken.invalid/x.png', fallback: 'Broken image ->' }))),
    h(Section, { name: 'Alert', note: 'Default and error variants.' },
      h(Alert, { title: 'Heads up' }, 'This is a default alert.'),
      h(Alert, { variant: 'error', title: 'Something failed' }, 'This is an error alert.')),
    h(Section, { name: 'Progress', note: 'Click to advance.' },
      h(Progress, { value: progress }),
      h(Button, { variant: 'ghost', size: 'sm', onClick: () => setProgress(p => (p + 20) % 120) }, 'Advance')),
    h(Section, { name: 'Skeleton and Spinner', note: 'A loading placeholder and a rotating indicator.' },
      h(Stack, { direction: 'row', gap: 'md', align: 'center' },
        h(Skeleton, { style: { width: 120, height: 16 } }), h(Spinner, null))),
    h(Section, { name: 'Separator', note: 'Horizontal between two lines; vertical between two words.' },
      h('div', null, 'Above'), h(Separator, null), h('div', null, 'Below'),
      h(Stack, { direction: 'row', gap: 'sm', align: 'center' }, h('span', null, 'Left'), h('div', { style: { height: 16 } }, h(Separator, { orientation: 'vertical', decorative: true })), h('span', null, 'Right'))))
}

// The 15 primitives re-exported straight from the app this pass (spec 038-ui-component-library T035). Each one below is real, live output, not a mock; the tool
// blocks are given real-shaped fixture data so the truncation, copy button and status pill all behave as they would on a real tool call.
function Blocks() {
  const [open, setOpen] = React.useState(false)
  const [risk, setRisk] = React.useState(false)
  const [ack, setAck] = React.useState(false)
  return h(Stack, { gap: 'md' },
    h(Section, { name: 'StateDot and ConnectionIndicator', note: 'Status dots used by ToolCallCard and the connection banner.' },
      h(Stack, { direction: 'row', gap: 'md', align: 'center' },
        h(StateDot, { state: 'done' }), h(StateDot, { state: 'error' }), h(StateDot, { state: 'ongoing' }),
        h(ConnectionIndicator, { state: 'connected' }))),
    h(Section, { name: 'DisclosureRow', note: 'The collapsible row ToolCallCard is built on.' },
      h(DisclosureRow, { icon: h(StateDot, { state: 'done' }), title: 'Read', open, expandable: true, onToggle: () => setOpen(!open), collapsedContent: h('span', null, 'a.ts') }, h('p', { style: { margin: 0 } }, 'expanded body')),
      h('span', { style: { color: ui.roles.textMuted, fontSize: 12 } }, 'open = ' + open)),
    h(Section, { name: 'Switch and Input (bare)', note: 'The primitives SwitchField and Field build on; Switch needs its own visible label, Input has none.' },
      h(Stack, { direction: 'row', gap: 'md', align: 'center' },
        h(Switch, { checked: risk, onChange: setRisk, label: 'Bare switch' }), h(Input, { value: '', onChange: () => {} }))),
    h(Section, { name: 'TerminalBlock', note: 'A settled command with a non-zero exit.' },
      h(TerminalBlock, { command: 'pnpm test', output: '1 failing\n  expected true to be false', exitCode: 1, labels: { signal: s => 'signal ' + s, exitCode: c => 'exit ' + c, running: 'Running', failed: 'Failed', done: 'Done', copy: 'Copy', copied: 'Copied', noOutput: 'No output', collapseAria: 'Collapse', expandAria: n => 'Show ' + n + ' more' } })),
    h(Section, { name: 'ReadBlock', note: 'A file window with line numbers.' },
      h(ReadBlock, { label: 'src/index.ts', totalLines: 42, lines: [{ number: 1, text: 'export const x = 1' }, { number: 2, text: 'export const y = 2' }], labels: { window: (n, t) => 'Showing ' + n + ' of ' + t, copy: 'Copy', copied: 'Copied', collapseAria: 'Collapse', expandAria: n => 'Show ' + n + ' more', collapse: 'Collapse', expand: n => 'Show ' + n + ' more' } })),
    h(Section, { name: 'DiffBlock', note: 'One hunk, added and removed lines.' },
      h(DiffBlock, { diffs: [{ path: 'src/index.ts', oldText: 'const x = 1\n', newText: 'const x = 2\n' }], labels: { copy: 'Copy', copied: 'Copied', collapseAria: 'Collapse', expandAria: n => 'Show ' + n + ' more', collapse: 'Collapse', expand: n => 'Show ' + n + ' more', files: n => n + ' file' } })),
    h(Section, { name: 'JsonTree', note: 'A collapsible tree; click a row to expand.' },
      h(JsonTree, { data: { name: 'acryl', tags: ['ui', 'cordis'] }, label: 'Demo JSON', labels: { copyValue: 'Copy value', copyJson: 'Copy JSON', copyPath: 'Copy path', copyPrettyJson: 'Copy pretty', copyCompactJson: 'Copy compact', copied: 'Copied', copyFailed: 'Copy failed', collapseNode: 'Collapse', expandNode: 'Expand' } })),
    h(Section, { name: 'RiskConfirmation', note: 'The app\'s own destructive-confirmation control (Dialog has no danger state on web); the confirm button stays disabled until acknowledged is checked.' },
      h(RiskConfirmation, { open: true, title: 'Delete workspace?', description: 'This removes every session in it. This cannot be undone.', acknowledgeLabel: 'I understand this cannot be undone', cancelLabel: 'Cancel', closeLabel: 'Close', confirmLabel: 'Delete', acknowledged: ack, onAcknowledgedChange: setAck, onCancel: () => setAck(false), onConfirm: () => {} })))
}

function SettingsForm() {
  const [permission, setPermission] = React.useState('write')
  const [theme, setTheme] = React.useState('system')
  const [queue, setQueue] = React.useState(true)
  const [confirm, setConfirm] = React.useState(false)
  return h('div', null,
    h(SettingsRow, { label: 'Permission', description: 'Choose the default permission mode for new sessions' },
      h(SelectField, { label: 'Permission', value: permission, onChange: setPermission, options: [{ id: 'read', label: 'Read Only' }, { id: 'write', label: 'Workspace Write' }, { id: 'full', label: 'Full access' }] })),
    h(Segmented, { title: 'Appearance', value: theme, onChange: setTheme, options: [{ id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }, { id: 'system', label: 'System' }] }),
    h(SettingsRow, { label: 'Queue while busy', description: 'What Enter does while the agent is running' }, h(SwitchField, { label: 'Queue', checked: queue, onChange: setQueue })),
    h(SettingsRow, { label: 'Reset settings', description: 'Restores every default' }, h(Button, { variant: 'ghost', size: 'sm', onClick: () => setConfirm(true) }, 'Reset')),
    h(Dialog, { open: confirm, title: 'Reset settings?', onClose: () => setConfirm(false), onConfirm: () => { setPermission('write'); setTheme('system'); setQueue(true) }, confirmLabel: 'Reset', danger: true }, 'This restores every setting to its default.'))
}

// The app's own tokens: each swatch is the DSH token the role resolves to, so nothing here is a color of our own except the two registered through the theme service.
function Colors() {
  return h(Stack, { gap: 'sm' }, Object.entries(ui.roles).map(([role, value]) =>
    h(Stack, { key: role, direction: 'row', gap: 'md', align: 'center' },
      h('span', { style: { width: 28, height: 28, borderRadius: 8, border: '0.5px solid ' + ui.roles.border, background: value }, 'aria-hidden': true }),
      h('code', null, value.replace(/^var\((.*)\)$/u, '$1')),
      h('span', { style: { color: ui.roles.textMuted, fontSize: 12 } }, role))))
}

const labels = { input: 'IN', output: 'OUT', running: 'Running', failed: 'Failed', stopped: 'Stopped' }
const dot = h('span', { 'aria-hidden': true }, '\u25B8')

// The conversation's tool-call row and the sidebar's New Session bar, extracted from the app itself.
function Conversation() {
  const [wide, setWide] = React.useState(true)
  return h(Stack, { gap: 'md' },
    h(ui.ToolCallCard, { icon: dot, title: 'Read', summary: 'src/index.ts', state: 'ok', input: 'src/index.ts', output: '42 lines', labels }),
    h(ui.ToolCallCard, { icon: dot, title: 'Bash', summary: 'pnpm test', state: 'running', input: 'pnpm test', labels }),
    h(ui.ToolCallCard, { icon: dot, title: 'Bash', summary: 'pnpm build', errorSummary: 'exit code 1', state: 'error', input: 'pnpm build', output: 'error TS2304', labels }),
    h(Stack, { direction: 'row', gap: 'md', align: 'center' },
      h('div', { style: { width: wide ? 220 : 56 } }, h(ui.SidebarRow, { icon: dot, label: 'New session', wide, onClick: () => setWide(!wide) })),
      h('span', { style: { color: ui.roles.textMuted, fontSize: 12 } }, 'Click to switch between the wide sidebar and the rail')))
}

// T045 batch 1 (spec 038-ui-component-library): Table, Direction, Marker, Message, Bubble, Pagination and NativeSelect, all ported from
// shadcn/ui's own source (new-york-v4, MIT) onto --dsw-alias-* tokens with no Radix and no new dependency.
function DirReadout() {
  return h('code', null, useDirection())
}

function T045Batch1() {
  const [page, setPage] = React.useState(2)
  const [mode, setMode] = React.useState('write')
  const [dir, setDir] = React.useState('ltr')
  const go = (event, next) => { event.preventDefault(); setPage(next) }
  const rows = [{ file: 'src/index.ts', lines: 42 }, { file: 'README.md', lines: 8 }, { file: 'package.json', lines: 31 }]
  const total = rows.reduce((sum, row) => sum + row.lines, 0)
  return h(Stack, { gap: 'md' },
    h(Section, { name: 'Table', note: 'A real table: caption, header, body and a footer total. Hover a row.' },
      h(Table, null,
        h(TableCaption, null, rows.length + ' files'),
        h(TableHeader, null, h(TableRow, null, h(TableHead, null, 'File'), h(TableHead, null, 'Lines'))),
        h(TableBody, null, rows.map(row => h(TableRow, { key: row.file }, h(TableCell, null, row.file), h(TableCell, null, String(row.lines))))),
        h(TableFooter, null, h(TableRow, null, h(TableCell, null, 'Total'), h(TableCell, null, String(total))))),
      h('p', { style: { margin: '8px 0 0', color: ui.roles.textMuted, fontSize: 12 } }, 'Rendered with this library\'s Table, not hand-rolled markup.')),
    h(Section, { name: 'Pagination', note: 'Click a page number, or Previous/Next. The current page carries aria-current=page.' },
      h(Pagination, null, h(PaginationContent, null,
        h(PaginationItem, null, h(PaginationPrevious, { href: '#', onClick: e => go(e, Math.max(1, page - 1)) })),
        [1, 2, 3].map(n => h(PaginationItem, { key: n }, h(PaginationLink, { href: '#', isActive: page === n, onClick: e => go(e, n) }, String(n)))),
        h(PaginationItem, null, h(PaginationEllipsis, null)),
        h(PaginationItem, null, h(PaginationNext, { href: '#', onClick: e => go(e, Math.min(3, page + 1)) })))),
      h('p', { style: { margin: '8px 0 0', color: ui.roles.textMuted, fontSize: 12 } }, 'page = ' + page)),
    h(Section, { name: 'NativeSelect', note: 'The platform\'s own dropdown - not the menu-overlay SelectField. Open it and pick a mode.' },
      h(NativeSelect, { value: mode, onChange: e => setMode(e.target.value), 'aria-label': 'Default permission mode' },
        h(NativeSelectOption, { value: 'read' }, 'Read Only'),
        h(NativeSelectOption, { value: 'write' }, 'Workspace Write'),
        h(NativeSelectOption, { value: 'full' }, 'Full access')),
      h('p', { style: { margin: '8px 0 0', color: ui.roles.textMuted, fontSize: 12 } }, 'mode = ' + mode)),
    h(Section, { name: 'Marker, Message and Bubble', note: 'A chat exchange: Marker as the day divider, Message rows around Bubble content (ghost and destructive variants below), a reaction pill on the second.' },
      h(Stack, { direction: 'row', gap: 'sm', align: 'center' },
        h(Button, { variant: 'outline', size: 'sm', onClick: () => setDir(dir === 'ltr' ? 'rtl' : 'ltr') }, 'Toggle direction'),
        h('span', { style: { color: ui.roles.textMuted, fontSize: 12 } }, 'useDirection() inside = '),
        h(DirectionProvider, { dir }, h(DirReadout))),
      h(DirectionProvider, { dir },
        h(MessageGroup, null,
          h(Marker, { variant: 'separator' }, h(MarkerContent, null, 'Today')),
          h(Message, null,
            h(MessageAvatar, null, 'A'),
            h(MessageContent, null,
              h(MessageHeader, null, 'Ada'),
              h(Bubble, null, h(BubbleContent, null, 'Is the table ported yet?')),
              h(MessageFooter, null, '10:04'))),
          h(Message, { align: 'end' },
            h(MessageAvatar, null, 'M'),
            h(MessageContent, null,
              h(MessageHeader, null, 'You'),
              h(Bubble, { variant: 'secondary', align: 'end' },
                h(BubbleContent, null, 'Yes - and so is this bubble.'),
                h(BubbleReactions, { side: 'bottom', align: 'end' }, '+1')),
              h(MessageFooter, null, '10:05'))),
          h(Message, null,
            h(MessageContent, null,
              h(Bubble, { variant: 'ghost' }, h(BubbleContent, null, 'ghost variant: no chrome at all')),
              h(MessageFooter, null, '10:06'))),
          h(Message, null,
            h(MessageContent, null,
              h(Bubble, { variant: 'destructive' }, h(BubbleContent, null, 'destructive variant: the run failed')),
              h(MessageFooter, null, '10:07'))),
          h(Marker, { variant: 'border' }, h(MarkerIcon, null, '\u2022'), h(MarkerContent, null, 'end of the demo'))))))
}

// T045 batch 2: ScrollArea, InputOTP, Item, Attachment, InputGroup, FormField. Every one of these composes shadcn sibling items in its
// source (Input, Textarea, Button, Label, Separator); each resolves that by styling the part locally, so none imports another item's file.
function T045Batch2() {
  const [otp, setOtp] = React.useState('12')
  const [invalid, setInvalid] = React.useState(false)
  const [copied, setCopied] = React.useState('')
  const [opened, setOpened] = React.useState('')
  const [removed, setRemoved] = React.useState('')
  const chips = [
    { state: 'done', title: 'notes.md', description: '12 KB' },
    { state: 'uploading', title: 'report.pdf', description: '1.4 MB' },
    { state: 'idle', title: 'drop a file here', description: 'idle' },
    { state: 'error', title: 'broken.png', description: 'upload failed' }
  ]
  const files = [
    { title: 'Table.tsx', description: 'A data table, ported first', size: 'default', variant: 'default' },
    { title: 'InputGroup.tsx', description: 'One border around a control and its addons', size: 'default', variant: 'outline' },
    { title: 'FormField.tsx', description: 'The layout around a field', size: 'sm', variant: 'muted' }
  ]
  return h(Stack, { gap: 'md' },
    h(Section, { name: 'ScrollArea', note: 'A fixed-height box that scrolls inside itself: the scrollbar is the platform\'s, styled, and reaching the end does not scroll the page behind it. The height goes on ScrollArea itself - that is the element that has to be definite.' },
      h(ScrollArea, { style: { height: 120 } }, Array.from({ length: 18 }, (_, index) => h('p', { key: index, style: { margin: '0 0 8px', color: ui.roles.textMuted, fontSize: 12 } }, 'line ' + (index + 1) + ' - scroll to the end and the page stays put')))),
    h(Section, { name: 'InputOTP', note: 'Type, paste, or arrow around: it is one real input covering the slots, so the platform handles all of it. The active slot blinks a caret.' },
      h(InputOTP, { value: otp, onChange: setOtp, maxLength: 6, label: 'Verification code' },
        h(InputOTPGroup, null, [0, 1, 2].map(index => h(InputOTPSlot, { key: index, index }))),
        h(InputOTPSeparator, null),
        h(InputOTPGroup, null, [3, 4, 5].map(index => h(InputOTPSlot, { key: index, index })))),
      h('p', { style: { margin: '8px 0 0', color: ui.roles.textMuted, fontSize: 12 } }, 'code = ' + (otp === '' ? '(empty)' : otp))),
    h(Section, { name: 'Item', note: 'List rows: media, content, description and actions, in the default, outline and muted variants with a separator between them.' },
      h(ItemGroup, null,
        h(Item, { variant: files[0].variant, size: 'default' },
          h(ItemMedia, { variant: 'icon' }, h('span', null, 'T')),
          h(ItemContent, null, h(ItemTitle, null, files[0].title), h(ItemDescription, null, files[0].description)),
          h(ItemActions, null, h(Button, { variant: 'outline', size: 'sm', onClick: () => setOpened(files[0].title) }, 'Open'))),
        h(ItemSeparator, null),
        h(Item, { variant: files[1].variant, size: 'default' },
          h(ItemMedia, { variant: 'icon' }, h('span', null, 'I')),
          h(ItemContent, null, h(ItemTitle, null, files[1].title), h(ItemDescription, null, files[1].description)),
          h(ItemActions, null, h(Button, { variant: 'outline', size: 'sm', onClick: () => setOpened(files[1].title) }, 'Open'))),
        h(ItemSeparator, null),
        h(Item, { variant: files[2].variant, size: 'sm' },
          h(ItemMedia, { variant: 'icon' }, h('span', null, 'F')),
          h(ItemContent, null, h(ItemTitle, null, files[2].title), h(ItemDescription, null, files[2].description)),
          h(ItemActions, null, h(Button, { variant: 'outline', size: 'sm', onClick: () => setOpened(files[2].title) }, 'Open')))),
      h('p', { style: { margin: '8px 0 0', color: ui.roles.textMuted, fontSize: 12 } }, 'opened = ' + (opened === '' ? 'nothing yet' : opened))),
    h(Section, { name: 'Attachment', note: 'File chips in every state, in a snapping row. The whole chip is the trigger; the x is its own action, so it never fires the trigger.' },
      h(AttachmentGroup, null, chips.map(chip => h(Attachment, { key: chip.title, state: chip.state },
        h(AttachmentMedia, { variant: 'icon' }, h('span', null, '\u2022')),
        h(AttachmentContent, null, h(AttachmentTitle, null, chip.title), h(AttachmentDescription, null, chip.description)),
        h(AttachmentActions, null, h(AttachmentAction, { label: 'Remove ' + chip.title, onClick: () => setRemoved(chip.title) }, h('span', null, '\u00d7'))),
        h(AttachmentTrigger, { label: 'Open ' + chip.title, onClick: () => setOpened(chip.title) })))),
      h('p', { style: { margin: '8px 0 0', color: ui.roles.textMuted, fontSize: 12 } }, 'opened = ' + (opened === '' ? '-' : opened) + '   removed = ' + (removed === '' ? '-' : removed))),
    h(Section, { name: 'InputGroup', note: 'One border around the control and its addons, so the focus ring and the error tint wrap the whole thing. Click the https:// prefix: the control focuses.' },
      h(InputGroup, null,
        h(InputGroupAddon, null, h(InputGroupText, null, 'https://')),
        h(InputGroupInput, { defaultValue: 'ui.shadcn.com', 'aria-label': 'URL', 'aria-invalid': invalid }),
        h(InputGroupAddon, { align: 'inline-end' }, h(InputGroupButton, { label: 'Copy URL', onClick: () => setCopied('ui.shadcn.com') }, 'Copy'))),
      h(Stack, { direction: 'row', gap: 'sm', align: 'center' },
        h(Button, { variant: 'outline', size: 'sm', onClick: () => setInvalid(!invalid) }, 'Toggle aria-invalid'),
        h('span', { style: { color: ui.roles.textMuted, fontSize: 12 } }, 'copied = ' + (copied === '' ? 'not yet' : copied)))),
    h(Section, { name: 'FormField', note: 'A field set with a legend, a horizontal field, a separator and an error that appears on the same toggle as the group above.' },
      h(FieldSet, null,
        h(FieldLegend, null, 'Permissions'),
        h(FieldGroup, null,
          h(FormField, { orientation: 'horizontal', invalid },
            h(FieldLabel, null, 'Workspace write'),
            h(FieldContent, null,
              h(FieldDescription, null, 'Let the agent write files in this workspace.'),
              invalid && h(FieldError, { errors: [{ message: 'Workspace write needs full access mode' }] }))),
          h(FieldSeparator, null, 'or'),
          h(FormField, { invalid },
            h(FieldLabel, null, 'Read only'),
            h(FieldContent, null, h(FieldDescription, null, 'Everything stays readable, and nothing is written.')))))))
}

// T045 batch 3: Popover and Slider. Both drop a Radix primitive for behaviour written by hand - open state plus
// outside-click/Escape/focus handling, and thumb arithmetic plus pointer and keyboard input respectively.
function T045Batch3() {
  const [notify, setNotify] = React.useState(true)
  const [open, setOpen] = React.useState(false)
  const [volume, setVolume] = React.useState([40])
  const [band, setBand] = React.useState([20, 80])
  const readout = text => h('p', { style: { margin: '8px 0 0', color: ui.roles.textMuted, fontSize: 12 } }, text)
  const popoverSection = h(Section, { name: 'Popover', note: 'A floating panel: click the trigger to open it, then click outside to close. Focus moves into the panel and back to the trigger. The width is fixed at 288px.' },
    h(Popover, { open, onOpenChange: setOpen },
      h(PopoverTrigger, { className: 'acryl-popover-trigger' }, 'Notifications'),
      h(PopoverContent, { label: 'Notification settings' },
        h(PopoverHeader, null,
          h(PopoverTitle, null, 'Notifications'),
          h(PopoverDescription, null, 'How the app tells you a run finished.')),
        h(Stack, { gap: 'sm' },
          h(SwitchField, { label: 'Notify on finish', checked: notify, onChange: setNotify }),
          h(Button, { variant: 'outline', size: 'sm', onClick: () => setOpen(false) }, 'Done')))),
    readout('open = ' + open + '   notify = ' + notify))
  const sliderSection = h(Section, { name: 'Slider', note: 'One thumb for a value, two for a range. Drag a thumb, or click anywhere on the track to move the nearest one. Each thumb takes arrow keys, PageUp/PageDown and Home/End.' },
    h(Slider, { value: volume, onValueChange: setVolume, label: 'Volume' }),
    readout('volume = ' + volume.join(', ')),
    h('div', { style: { height: 12 } }),
    h(Slider, { value: band, onValueChange: setBand, step: 5, label: 'Frequency band' }),
    readout('band = ' + band.join(' - ')))
  return h(Stack, { gap: 'md' }, popoverSection, sliderSection)
}

// A Settings page, not a dialog: the gallery is a catalogue for people building UI, so it lives in Settings (nav entry "UI library"), out of the everyday screens.
function Gallery() {
  const [tab, setTab] = React.useState('components')
  return h(Stack, { gap: 'md' },
    h('h2', { style: { margin: 0, fontSize: 18, fontWeight: 500, color: ui.roles.text } }, 'ACRYL UI library'),
    h('p', { style: { margin: 0, color: ui.roles.textMuted, fontSize: 13 } }, 'Ready-made parts for building screens: use them instead of hand-styling.'),
    h(Tabs, { label: 'Gallery sections', value: tab, onChange: setTab, tabs: [{ id: 'components', label: 'Components' }, { id: 'settings', label: 'Settings form' }, { id: 'conversation', label: 'Conversation' }, { id: 'blocks', label: 'Blocks' }, { id: 'blocks2', label: 'More blocks' }, { id: 'shadcn', label: 'shadcn ports' }, { id: 'shadcn2', label: 'shadcn ports 2' }, { id: 'shadcn3', label: 'shadcn ports 3' }, { id: 't045b1', label: 'T045 ports 1' }, { id: 't045b2', label: 'T045 ports 2' }, { id: 't045b3', label: 'T045 ports 3' }, { id: 'colors', label: 'Colors' }] },
      tab === 'components' ? h(Components) : tab === 'settings' ? h(SettingsForm) : tab === 'conversation' ? h(Conversation) : tab === 'blocks' ? h(Blocks) : tab === 'blocks2' ? h(Blocks2) : tab === 'shadcn' ? h(ShadcnBatch) : tab === 'shadcn2' ? h(ShadcnBatch2) : tab === 'shadcn3' ? h(ShadcnBatch3) : tab === 't045b1' ? h(T045Batch1) : tab === 't045b2' ? h(T045Batch2) : tab === 't045b3' ? h(T045Batch3) : h(Colors)))
}

exports.inject = ['slots']
exports.apply = function apply(ctx) { ui.settingsSection(ctx, { id: 'example-ui-library', order: 90, label: 'UI library' }, Gallery) }

return module.exports; } });
