#!/usr/bin/env bash
# Publish the ACRYL frame's 16 packages to npm (docs/plans/release-1.2.0.md, step 3), then print the tag commands for steps 5 and 6.
#
#   bash publish-frame.sh                  dry run (the default): every check, then `npm publish --dry-run` for each tarball; nothing is published
#   bash publish-frame.sh --publish        the real publish, signed in to npm as webboxescom (NPM_ACCOUNT names another)
#   bash publish-frame.sh [--publish] DIR  tarballs in DIR instead of ./frame next to this script
#
# The tarballs are the ones verify-frame-publish packed and proved (`pnpm run verify:frame-publish -- --keep`), with a SHA256SUMS file beside them.
# The script stops at the first failure. A package whose version is already on npm is skipped, so running it again after a failure resumes.
# acrylblends and create-acrylblends 1.2.0 are not published here: the release workflow publishes them from the tags (printed at the end).
set -euo pipefail

SCOPE=@acrylblends
ORG=acrylblends
# The account that owns acrylblends, create-acrylblends and the org (the owner's; another account is refused).
ACCOUNT="${NPM_ACCOUNT:-webboxescom}"
# Dependencies first: each package's frame dependencies are on npm before it is.
PACKAGES=(
  ui@0.3.0
  brand-client@0.1.0
  app-shell@0.1.0
  control@0.2.5
  loopback-http@0.1.0
  settings@0.1.0
  workspace@0.1.0
  sign-in@0.1.0
  diagnostics@0.1.0
  plugin-admin@0.1.0
  support@0.1.0
  web@0.1.0
  system-prompt@0.1.0
  app-context@0.1.0
  versions@0.1.0
  blends-frame@0.1.0
)

mode=dry
dir="$(cd "$(dirname "$0")" && pwd)/frame"
for arg in "$@"; do
  case "$arg" in
    --publish) mode=publish ;;
    --dry-run) mode=dry ;;
    -h | --help)
      sed -n '2,10p' "$0"
      exit 0
      ;;
    -*)
      echo "unknown option $arg (use --publish, --dry-run or a tarball folder)" >&2
      exit 2
      ;;
    *) dir="$(cd "$arg" && pwd)" ;;
  esac
done

say() { printf '%s\n' "$*"; }
stop() {
  printf 'STOPPED: %s\n' "$*" >&2
  exit 1
}

say "publish-frame: mode $mode, tarballs in $dir"
command -v npm > /dev/null || stop "npm is not installed"
[ -f "$dir/SHA256SUMS" ] || stop "$dir/SHA256SUMS is missing"
(cd "$dir" && shasum -a 256 -c SHA256SUMS > /dev/null) || stop "a tarball in $dir does not match SHA256SUMS"
say "ok   the 16 tarballs match SHA256SUMS"

# The account and the org: a publish needs both; a dry run reports them and goes on (npm publish --dry-run needs no login).
check_failed() {
  if [ "$mode" = publish ]; then stop "$1"; else say "WARN $1 (a publish would stop here)"; fi
}
account="$(npm whoami 2> /dev/null || true)"
if [ "$account" = "$ACCOUNT" ]; then
  say "ok   signed in to npm as $account"
  role="$(npm org ls "$ORG" --json 2> /dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s)[process.argv[1]]??"")}catch{console.log("")}})' "$account" || true)"
  if [ -n "$role" ]; then
    say "ok   the npm org $ORG lists $account ($role)"
  else
    check_failed "the npm org $ORG does not list $account"
  fi
elif [ -z "$account" ]; then
  check_failed "not signed in to npm (run npm login as $ACCOUNT)"
else
  check_failed "signed in to npm as $account, not $ACCOUNT (run npm logout, then npm login as $ACCOUNT)"
fi

published=0
skipped=0
for entry in "${PACKAGES[@]}"; do
  short="${entry%@*}"
  version="${entry#*@}"
  name="$SCOPE/$short"
  tarball="$dir/acrylblends-$short-$version.tgz"
  [ -f "$tarball" ] || stop "$tarball is missing"
  # The tarball must be the package and version this line names.
  packed="$(tar xzf "$tarball" -O package/package.json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const p=JSON.parse(s);console.log(p.name+"@"+p.version)})')"
  [ "$packed" = "$name@$version" ] || stop "$tarball is $packed, expected $name@$version"
  if [ "$(npm view "$name@$version" version 2> /dev/null || true)" = "$version" ]; then
    say "skip $name@$version is already on npm"
    skipped=$((skipped + 1))
    continue
  fi
  if [ "$mode" = publish ]; then
    npm publish "$tarball" --access public || stop "npm publish $name@$version failed; fix the cause and run this again (it resumes here)"
    say "ok   published $name@$version"
  else
    npm publish "$tarball" --access public --dry-run > /dev/null 2>&1 || stop "npm publish --dry-run of $name@$version failed"
    say "ok   $name@$version would publish (dry run)"
  fi
  published=$((published + 1))
done

if [ "$mode" = publish ]; then
  say "publish-frame: $published published, $skipped already on npm"
  say "check each answers (npm can lag a few minutes): for p in ${PACKAGES[*]%@*}; do npm view $SCOPE/\$p version; done"
else
  say "publish-frame: dry run done, $published would publish, $skipped already on npm; run again with --publish to publish"
fi

cat << 'EOF'

Next, in a clone of github.com/acrylblends/acrylblends, after 129-create-1-2-0 is merged into main and CI on main is green (checklist step 4):

  git fetch origin
  git tag v1.2.0 origin/main && git push origin v1.2.0
    -> approve the npm-release environment of that release run (Actions, Review deployments, Approve); wait for acrylblends 1.2.0 on npm:
       npm view acrylblends version
  git tag create-v1.2.0 origin/main && git push origin create-v1.2.0
    -> approve its npm-release environment the same way; then: npm view create-acrylblends version
EOF
