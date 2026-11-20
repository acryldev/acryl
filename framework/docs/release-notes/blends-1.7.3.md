# @acryldev/blends 1.7.3

Released 2026-11-20.

## New

- **Settings > Share** in every app, in a window or a browser tab: send the whole app, as it is now, to a GitHub repository of your own.
  The plan comes first (which repository, private or public, what is saved first) and nothing leaves the computer until you say yes. GitHub
  is connected right there, the way the Plugins page connects it. It runs the app's own share command, so `npm run share`, ACRYL Control
  Center's Share and this page follow the same rules.
- `npm run share -- --visibility public` (or `private`): who may see a new repository. The choice is kept in blend.yaml
  (`metadata.visibility`), so every later save agrees; the file's comments and layout are kept.

New frame package: @acryldev/blends-frame 0.2.1. New library versions: @acryldev/save 0.1.1, @acryldev/app-persistence 0.1.3.
