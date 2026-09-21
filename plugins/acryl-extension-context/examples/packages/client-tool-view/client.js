// Example: client-tool-view.custom-card  (browser half)
// Type:     client-slot (tool renderer)
// Surfaces: web desktop
// Teaches:  `tool.call.toolview` is a KEYED slot dispatched by the wire tool name: register with `key: '<tool name>'` (any tool, including one your own
//           package registered) and the app renders that tool's calls with your component. It receives `{ callId, toolName, block, cwd, openFile, ... }`
//           (full contract in maps/slot-contracts.md). `block` is either a RUNNING call (`block.name`, `block.argsRaw`, no `kind: 'tool-result'`) or a
//           SETTLED result (`block.kind === 'tool-result'`, `block.content` = content blocks, `block.isError`, `block.call.argsRaw`). Render both. A key the
//           app already covers (bash, read, edit, ...) is REPLACED, not shared, so use it for your own tools. Build from the shared components.
// Expect:   a small card: "words" and "chars" tags for a finished call, "counting..." while running.
// Docs:     extending.client-slot
// Pattern:  maps/slot-contracts.md ("tool.call.toolview"), deepseek-harness/packages/client/ui-tool (the shipped tool rows)
window.__ModuleLoader__.load({ id: 'acryl-example-tool-view', factory: (require) => {
var module = { exports: {} }; var exports = module.exports;

const React = require('react')
const { Tag } = require('@deepseek-ai/dsh-client-ui-primitives')
const h = React.createElement
const ID = 'acryl-example-tool-view'
console.info('[' + ID + '] client module loaded')

function parse(block) {
  if (block.kind !== 'tool-result') return undefined
  const text = (block.content || []).map(part => (part.type === 'text' ? part.text : '')).join('')
  try { return JSON.parse(text) } catch { return undefined }
}

function WordStatsView({ toolName, block }) {
  const stats = parse(block)
  const failed = block.kind === 'tool-result' && block.isError
  return h('div', { 'data-example': ID, style: { display: 'flex', gap: 8, alignItems: 'center', padding: '6px 10px', border: '1px solid var(--dsw-alias-border-l1, #8884)', borderRadius: 8, margin: '4px 0' } },
    h('strong', null, toolName),
    failed ? h(Tag, { tone: 'outline' }, 'failed')
      : stats ? [h(Tag, { key: 'w', tone: 'outline' }, stats.words + ' words'), h(Tag, { key: 'c', tone: 'outline' }, stats.chars + ' chars')]
        : h('span', { style: { opacity: 0.7 } }, 'counting...'))
}

// Required service: the slot registry.
exports.inject = ['slots']

exports.apply = function apply(ctx) {
  console.info('[' + ID + '] apply: registering tool view')
  // slots.inject waits for the slot's own declaration (it exists while the chat entry is mounted), so load order does not matter.
  ctx.slots.inject('tool.call.toolview', () =>
    ctx.slots.register({ name: 'tool.call.toolview', key: 'example_word_stats' }, WordStatsView))
}

return module.exports; } });
