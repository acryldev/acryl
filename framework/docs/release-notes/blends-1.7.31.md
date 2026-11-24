# @acryldev/blends 1.7.31

Released 2026-11-24.

- **`acrylblends pack --from .` exports a running app.** create copies a folder as git sees it (`git ls-files --cached --others
  --exclude-standard` when the folder is the top of a repository), so an app's local state stays behind: before, a running app's
  `.acryl/door.json` came along and the secret check refused the whole pack. Without git, `.acryl`, `.acrylblends` and `.env*` are left out.
  ACRYL AOS's Export as installer packs an app this way.
- **The sign-in plugin says what to do with a refused API key** (@acryldev/sign-in 0.2.4, in the frame's release list): DeepSeek's
  "Authentication Fails" and OpenAI's "Incorrect API key" now say to enter a valid key in Settings > Models.
