# Review fixture

A small, fixed project the frame comparison opens in both ACRYL and acrylblends. `setup.mjs` materializes it as a git
repository with a fixed commit (author, committer and dates fixed), a tracked file modified in the working tree and one
untracked file, so the Files, Changes and Review views show the same state on both surfaces. The file contents, modes
and commit message are part of the fixture; do not edit them without updating the expected commit hash in
`setup.mjs`.
