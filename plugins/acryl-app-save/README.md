# acryl-app-save

`/app save` and `/app connect` inside an ACRYL app: keep the app in its own git repository without a terminal. Every save runs a secret check, a private app
never reaches a public remote, and repositories are created through the user's own `gh` login (no token is ever handled). The rules live in
`@acryl/app-persistence`; this plugin is the swappable Cordis part. Disable its row and the commands go.
