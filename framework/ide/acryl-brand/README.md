# acryl-brand

A configurable product identity for the ACRYL Web and Desktop app. Everything is in the row's `config`; the plugin has no
code to edit to rebrand.

```yaml
- id: brand
  name: acryl-brand
  config:
    name: Orbit
    tagline: Plan your day by talking to it.
    accent: '#e8590c'
    accentDark: '#ff922b'
    fontFamily: Georgia, serif
    mark: O
```

Sets the sidebar name and mark, the conversation hero mark, the accent color and font, the tab or window title and the
favicon. Disable the row and the stock look returns; nothing else is touched. Blueprints (`acryl.blank`) carry a brand and
the runtime turns `ACRYL_BRAND_NAME` (and `_TAGLINE`, `_ACCENT`, `_ACCENT_DARK`, `_FONT`, `_MARK`) into this config.
