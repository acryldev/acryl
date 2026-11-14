# acrylblends 1.5.5

An app shares itself: `npm run share` gives it a repository of its own on GitHub and pushes it there, after a person reads what would be sent.
Released with [create-acrylblends 1.5.5](create-1.5.5.md); the one frame package that changes is `@acrylblends/blends-frame` 0.1.3.

- **`npm run share`.** It prints the plan: the repository (a new one under your account, or the remote the app already has), who can see it, and how
  many changed files are saved first. Only a plain yes at the terminal sends it. `--owner <account>` names another account or organization.
  The guards of `npm run save` hold: a file that holds a secret stops it, and a private app never goes to a public repository.
- **For programs.** `npm run share -- --json` prints the plan and sends nothing. `--confirm <plan>` sends exactly that plan, and nothing when the app
  changed since: a person's own surface (the ACRYL launcher's Share button) uses it after showing the plan and taking the yes.
- **An agent cannot say yes.** In the frame, a shell command that shares with `--confirm` asks the person first, as `git push` and
  `gh repo create` do.

An app made with an earlier release gets the command with `npx acrylblends upgrade`; add the script `"share": "node plugins/save/share-cli.ts"`
to its package.json, or run that file with node.
