# @acryldev/blends 1.7.8

Released 2026-11-20.

## Added

- A shared app can be listed in the Blends store: `npm run share -- --visibility public --list [--category <slug> --subcategory <slug> --license <id>]`.
  The plan shows where it lands (prefilled from the Blueprint the app was made from) and the licence (MIT unless chosen); on yes the app gets
  the keywords `acrylblends-blend`, `acrylblends-category-<slug>` and `acrylblends-subcategory-<slug>` in package.json, a licence, the topic
  `acrylblends-blend` and a version tag, and the store lists it as Community under its category (@acryldev/save 0.1.3, @acryldev/app-persistence
  0.1.4; 35680113, 4136e9d1).
