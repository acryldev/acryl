# @acryldev/blends 1.7.6

Released 2026-11-20.

## Fixed

- `create --from` a Blend that already carries the Blends frame as packages (ACRYL Control Center and ACRYL ADE from the registry, which `acryl --gui`
  and `acryl ade` make) no longer stops at "the app already has plugins/desktop-shell": such a starter is not framed a second time (cf09fbe7).
