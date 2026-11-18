# acrylblends 1.5.3

An app's first run asks for a model with Settings > Models in front of the person, and DeepSeek's preview notice is gone. Released with
[create-acrylblends 1.5.3](create-1.5.3.md); the one frame package that changes is `@acrylblends/sign-in` 0.1.1.

- **Connect a model at first run.** A new app's first-run step shows the Models page itself (the DeepSeek key box, a third-party provider, a custom
  model API, and the account sign-in at its foot) with "More providers in Settings" and "Later", instead of the key box alone.
- **No preview notice.** The notice that DeepSeek's models plugin shows in a browser window (and that could fail with "The acknowledgement could not be
  saved") is replaced by a step that ends at once.
- **ChatGPT sign-in.** The ChatGPT row is named from whichever of the `openai` and legacy `openai-codex` routes the catalog gives the account flow
  (this fix was already in 1.5.2's source; it now also lives in ACRYL's).
- **Settings opens on Models.** "More providers in Settings" opens Settings on the Models page, not on General.

An app made with an earlier release keeps what it has; `acrylblends upgrade` brings the frame's packages forward.
