# @acryldev/blends 1.7.9

Released 2026-11-20.

## Fixed

- Every app that carries the save plugin has `npm run save` and `npm run share`, also one made from a registry Blueprint that is already
  framed (it skipped the step that added them); `npm run share -- --help` lists the flags (@acryldev/save 0.1.4, fc0bfbd8).
