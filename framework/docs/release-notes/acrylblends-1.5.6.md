# acrylblends 1.5.6

Sharing works for everyone signed in with `gh`, and an app in a WebBoxes.ai box takes its model key.
Released with [create-acrylblends 1.5.6](create-1.5.6.md); the one frame package that changes is `@acryldev/blends-frame` 0.1.4.

- **`plugin publish`, the frame's Share button and `npm run share` push through your `gh` login.** Before, a person whose `gh auth login`
  chose SSH, or who never ran `gh auth setup-git`, got `could not read Username for 'https://github.com'` after the repository was already
  created. Only github.com addresses use the `gh` login; a remote on another host keeps your own git setup. (`@acryldev/plugin-hub-core` 0.2.2,
  `@acryldev/app-persistence` 0.1.2.)
- **An app served under a public name trusts that name for its `/api`.** In a WebBoxes.ai box (`ACRYL_PUBLIC_ORIGIN`), Settings > Models and the
  chat answered 403, so the model key could not be entered.

An app made with an earlier release gets both with `npx acrylblends upgrade`, then `npm install`.
