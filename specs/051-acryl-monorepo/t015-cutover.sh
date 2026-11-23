#!/bin/sh
# T015: the cut-over commands for acrylblends/acrylblends becoming a pointer to acryldev/acryl/tree/main/framework.
# This script PRINTS them and runs nothing: every step below is outward (a push, a GitHub edit, an archive, an npm publish),
# and each needs the owner's go. See t015-cutover.md next to this file for the text and the audit behind it.
set -eu

cat <<'OUT'

# ---------------------------------------------------------------- 0. before the cut-over
# The npm metadata fixes (t015-cutover.md, section 4) land in acryldev/acryl and the next
# acrylblends / create-acrylblends release publishes them. Nothing here publishes anything.

# ---------------------------------------------------------------- 1. the README pointer (OWNER GO)
git clone git@github.com:acrylblends/acrylblends.git
cd acrylblends
git checkout main
git switch -c moved-pointer
# Replace README.md with the text in t015-cutover.md, section 1, then:
git add README.md
git commit -m "docs: this repository moved to acryldev/acryl/framework"
git push origin moved-pointer          # a pull request; merge it after review, with the owner's go

# ---------------------------------------------------------------- 2. the repository description (OWNER GO)
gh repo edit acrylblends/acrylblends \
  --description "MOVED to https://github.com/acryldev/acryl/tree/main/framework - the ACRYL Blends Cordis framework. npm create acrylblends@latest still works; history stays here."

# ---------------------------------------------------------------- 3. the two open pull requests (OWNER GO)
# #4 (fix(cli): Ctrl-C on npm run dev lets the host finish stopping): port onto framework/packages/cli
gh pr checkout 4 -R acrylblends/acrylblends -b port-pr-4
git format-patch --stdout origin/main..port-pr-4 > /tmp/pr-4.patch
# in a checkout of acryldev/acryl:
git checkout -b port/pr-4-smrifat1411 main
git apply --directory=framework /tmp/pr-4.patch
git push origin port/pr-4-smrifat1411
gh pr create --repo acryldev/acryl --head port/pr-4-smrifat1411 \
  --title "fix(cli): Ctrl-C on npm run dev lets the host finish stopping" \
  --body "Ported from acrylblends/acrylblends#4 by @smrifat1411."
gh pr close 4 -R acrylblends/acrylblends \
  --comment "Continues as the pull request against acryldev/acryl (the code moved to framework/ in spec 051)."
# #5 (docs: where an app's data lives): the same, applying to framework/docs (check each hunk; the files moved).
# Any issue that appears before the archive: gh issue transfer <number> acryldev/acryl

# ---------------------------------------------------------------- 4. the archive (OWNER GO)
gh repo archive acrylblends/acrylblends --yes
# Or, instead, keep it read-only as a mirror (the ledger's alternative):
#   git -C acryldev/acryl subtree split --prefix=framework -b framework-mirror
#   git push git@github.com:acrylblends/acrylblends.git framework-mirror:main

# ---------------------------------------------------------------- afterwards
# Re-run the audit (t015-cutover.md, section 4) once 1.6.0 is on npm:
#   npm view acrylblends repository.url homepage bugs.url
#   npm view create-acrylblends repository.url homepage bugs.url
# and deprecate the superseded legacy names, with the npm token and the owner's go:
#   npm deprecate "@acrylblends/blends-frame@*" "Use @acryldev/blends-frame"
#   npm deprecate "@acrylblends/app-shell@*" "Use @acryldev/app-shell"
OUT
