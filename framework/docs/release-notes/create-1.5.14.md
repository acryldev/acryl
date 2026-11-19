# create-acrylblends 1.5.14

Ships with [acrylblends 1.5.13](acrylblends-1.5.13.md).

## Changed

- **A starter may be 64 MB (was 50 MB).** A game is a whole app with its models, textures and sounds, and the registry now takes an entry of up to 64 MB, so `npm create @acryldev/blends@latest my-rpg -- --from acrylblends.action-rpg` (about 52 MB) makes the app instead of refusing with "the template is larger than 50 MB". The limit on the number of files (5000) is unchanged.
- **A private GitHub source uses your own GitHub login.** `--from github:<owner>/<repo>` first tries the anonymous download; when that finds nothing it tries again with `GITHUB_TOKEN`, `GH_TOKEN` or `gh auth token`, and without a login the error says to sign in.
