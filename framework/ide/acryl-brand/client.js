// acryl-brand (browser half). A bundle without a build step: CommonJS in the module-loader wrapper, `react` from the app.
// Reads the identity the host half published as window.__ACRYL_BRAND__ and applies it: sidebar name and mark, conversation
// hero mark, accent color and font through the theme service, and the tab or window title.
window.__ModuleLoader__.load({ id: 'acryl-brand', factory: (require) => {
var module = { exports: {} }; var exports = module.exports;

const React = require('react')
const h = React.createElement
const SOURCE = 'acryl-brand'

function identity() {
  const value = typeof window === 'undefined' ? undefined : window.__ACRYL_BRAND__
  return value && typeof value.name === 'string' ? value : undefined
}

// A rounded accent square with the mark text; `size` is what the slot passes. The class keeps the host's hover geometry.
function Mark(props) {
  const brand = identity()
  if (!brand) return null
  const size = props.size || 24
  return h('span', {
    'aria-hidden': 'true',
    className: props.className,
    style: { display: 'inline-flex', flex: 'none', alignItems: 'center', justifyContent: 'center', width: size, height: size, borderRadius: Math.round(size / 4), background: brand.accent || 'var(--dsw-alias-brand-primary, #3b6ef5)', color: '#fff', fontWeight: 700, fontSize: Math.round(size * 0.55), lineHeight: 1 },
  }, brand.mark)
}

function Name() {
  const brand = identity()
  return brand ? h('span', null, brand.name) : null
}

exports.inject = ['slots', 'theme']

exports.apply = function apply(ctx) {
  const brand = identity()
  if (!brand) { console.warn('[' + SOURCE + '] no identity published by the host half; leaving the stock brand'); return }
  ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.register({ name: 'sidebar.brand.mark' }, Mark))
  ctx.slots.inject('sidebar.brand.name', () => ctx.slots.register({ name: 'sidebar.brand.name' }, Name))
  ctx.slots.inject('conversation.hero.brand.mark', () => ctx.slots.register({ name: 'conversation.hero.brand.mark' }, Mark))
  const tokens = {}
  if (brand.accent) tokens['--dsw-alias-brand-primary'] = { light: brand.accent, dark: brand.accentDark || brand.accent }
  if (brand.fontFamily) tokens['--dsw-font-family'] = { light: brand.fontFamily, dark: brand.fontFamily }
  if (Object.keys(tokens).length > 0) ctx.effect(() => ctx.theme.overrideTokens(SOURCE, tokens), SOURCE + ': theme tokens')
  // The app rewrites document.title from a locale string a plugin cannot replace; keep the product name on it.
  ctx.effect(() => {
    const rename = () => {
      const next = document.title.replaceAll('ACRYL', brand.name).replaceAll('DeepSeek Harness', brand.name)
      if (next !== document.title) document.title = next
    }
    rename()
    const observer = new MutationObserver(rename)
    observer.observe(document.head, { childList: true, characterData: true, subtree: true })
    return () => observer.disconnect()
  }, SOURCE + ': title')
}

return module.exports; } });
