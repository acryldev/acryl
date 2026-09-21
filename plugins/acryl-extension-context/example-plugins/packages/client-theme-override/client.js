// Example: ui-theme.override  (browser half)
// Type:     client-slot (theme service)
// Surfaces: web desktop (the same code; both render the same client app)
// Teaches:  restyle the app WITHOUT touching a stylesheet: the client `theme` service stacks a token override layer
//           over whichever theme is active. `ctx.theme.overrideTokens(sourceId, { '--token': { light, dark } })`:
//           BOTH modes are mandatory (repeat the value if it is the same in both), so the override never turns illegible
//           when the user switches light/dark. One layer per sourceId: calling again replaces it; the returned disposer
//           removes it. Font: override `--dsw-font-family` (a CSS font-family list; load a web font with an
//           `@font-face` <style> if it is not a system font). To ship a whole named theme instead, `ctx.theme.register({
//           id, colorScheme: 'light' | 'dark', tokens })` and let the user pick it (`ctx.theme.setTheme(id)` changes the
//           user's saved preference, so only do that when they asked).
//           TAB / WINDOW TITLE: the app rewrites `document.title` at runtime from a locale string that a plugin cannot
//           replace, so a title set in index.html (see web-page-branding) is overwritten. Keep yours with a
//           MutationObserver on <head> that rewrites the product name (below). The host page title is only the pre-boot title.
// Expect:   the brand accent becomes orange, the UI font a serif stack, and the tab title reads "My Studio".
// Docs:     extending.ui-theme
// Pattern:  deepseek-harness/packages/client/ui-theme (ThemeRuntime.overrideTokens / register)
window.__ModuleLoader__.load({ id: 'acryl-example-theme-override', factory: (require) => {
var module = { exports: {} }; var exports = module.exports;

const SOURCE = 'acryl-example-theme-override'
console.info('[' + SOURCE + '] client module loaded')

// Required service: the theme registry (ui-theme).
exports.inject = ['theme']

exports.apply = function apply(ctx) {
  // Effect-owned: the layer is removed when this plugin unloads (remove or update), restoring the base theme.
  ctx.effect(() => ctx.theme.overrideTokens(SOURCE, {
    // Brand accent: buttons, focus, links. Use a lighter value in dark mode for contrast.
    '--dsw-alias-brand-primary': { light: '#e8590c', dark: '#ff922b' },
    // Font for the whole app (system fonts only; no download).
    '--dsw-font-family': {
      light: "Georgia, 'Times New Roman', serif",
      dark: "Georgia, 'Times New Roman', serif",
    },
  }), SOURCE + ': token layer')
  // Keep the product name in the tab/window title (the app resets it whenever the session title changes).
  ctx.effect(() => {
    const rename = () => {
      const next = document.title.replaceAll('ACRYL', 'My Studio').replaceAll('DeepSeek Harness', 'My Studio')
      if (next !== document.title) document.title = next
    }
    rename()
    const observer = new MutationObserver(rename)
    observer.observe(document.head, { childList: true, characterData: true, subtree: true })
    return () => observer.disconnect()
  }, SOURCE + ': title')
  console.info('[' + SOURCE + '] apply: override layer registered')
}

return module.exports; } });
