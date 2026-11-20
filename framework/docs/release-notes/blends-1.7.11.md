# @acryldev/blends 1.7.11

Released 2026-11-20.

## Added

- Agents operate the ACRYL frame itself: the door verb `frame` opens, closes or toggles the left and right panels, opens Settings and switches
  Build/Preview, and `look` reports the frame. Agents are told to operate the interface, never to edit code for it (@acryldev/door 0.1.1,
  @acryldev/blends-frame 0.2.9, @acryldev/app-context 0.2.1; 838886ca).
- One GitHub sign-in: Connect GitHub inside an app uses the ACRYL OAuth app, the same as ACRYL Control Center, and one sign-in counts for both;
  shares use it (@acryldev/app-persistence 0.1.5, @acryldev/save 0.1.5, @acryldev/launcher 0.1.4; de454f84).

## Fixed

- `create --from` a starter whose page is the IDE workbench (ACRYL ADE) works (f9d1369b).
