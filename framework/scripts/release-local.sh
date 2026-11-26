#!/usr/bin/env bash
# The manual npm release of the framework CLI and creator (@acryldev/blends, @acryldev/create-blends) and every @acryldev package a new app installs that npm does not have yet. It is the path used while npm trusted
# publishing is not set up for the unscoped names (spec 051 T037); framework-release.yml takes over once it is.
#   bash framework/scripts/release-local.sh         print-only (the default): packs everything, checks it, prints every outward step, publishes nothing
#   bash framework/scripts/release-local.sh --go    the same checks, then publishes, tags, cancels the tag-triggered release runs, and proves both create commands
#   --tag <name>   the npm dist-tag every publish uses (default latest). `--tag next` publishes the release without moving what `npm create @acryldev/blends` gets.
#   --promote      after a `--tag next` release is proven from npm: moves `latest` to this release, for exactly the packages whose `next` is the workspace's
#                  version (the ones this release published), and prints each one's latest after. Print-only without --go, like the rest.
# The version is the CLI's package.json version. Run it from an acryl checkout whose HEAD is a landed main commit (clean tree, on origin/main).
# Checks: every @acryldev dependency of the CLI, the library plugins, the frame (framework/frame/packages.json), the templates, ADE and Control
# Center is on npm with the same content or is packed and published first, in dependency order; a package whose npm copy differs at the same
# version, or whose prepack check fails, stops the release; so does any tarball that imports the CLI by its alias (a bin with no exports).
# Order: missing @acryldev packages, then the two (the acryldevadmin npm account). The short names acrylblends and create-acrylblends are deprecated
# on npm and no longer released (owner 2026-11-26).
# Tokens are read from ~/.secure-storage/npm/npm.json into temporary 0600 userconfigs that are deleted on exit; no token is ever printed or stored here.
set -euo pipefail

step() { printf '\n== %s\n' "$*"; }
die() { printf 'release: STOP: %s\n' "$*" >&2; exit 1; }
GO=0; TAG=latest; PROMOTE=0
while [ $# -gt 0 ]; do
  case $1 in
    --go) GO=1 ;;
    --tag) [ $# -ge 2 ] || die "--tag needs a name"; TAG=$2; shift ;;
    --promote) PROMOTE=1 ;;
    *) die "unknown argument $1 (use --go, --tag <name>, --promote)" ;;
  esac
  shift
done
# npm refuses a tag that parses as a version range; keep to plain names.
[[ $TAG =~ ^[a-z][a-z0-9-]*$ ]] || die "--tag $TAG: use a plain name such as latest or next"
[ "$PROMOTE" = 0 ] || [ "$TAG" = latest ] || die "--promote moves latest; it takes no --tag"
repo=$(git rev-parse --show-toplevel)
cd "$repo"
# shellcheck disable=SC2329
outward() { if [ "$GO" = 1 ]; then echo "+ $*"; "$@"; else echo "would run: $*"; fi; }

# The two packages: folder, published name (both owned by the acryldev npm account).
DIRS=(cli create)
# Plain functions, not associative arrays: macOS's /bin/bash is 3.2.
name_of() { case $1 in cli) echo @acryldev/blends;; create) echo @acryldev/create-blends;; esac; }
tag_of() { case $1 in cli) echo blends-v;; create) echo create-blends-v;; esac; }
ALL_NAMES="@acryldev/blends @acryldev/create-blends"

step "checkout"
[ -z "$(git status --porcelain)" ] || die "the tree is not clean"
git fetch -q origin main
commit=$(git rev-parse HEAD)
if ! git merge-base --is-ancestor "$commit" origin/main; then
  # RELEASE_DRY_UNLANDED=1 lets a print-only run check a branch before it lands; --go never releases an unlanded commit.
  [ "$GO" = 0 ] && [ "${RELEASE_DRY_UNLANDED:-}" = 1 ] && echo "note: $commit is not on origin/main (allowed for this print-only run)" || die "HEAD $commit is not on origin/main; release only a landed commit"
fi
echo "commit $commit"

step "versions"
version=$(node -p "require('./framework/packages/cli/package.json').version")
for d in "${DIRS[@]}"; do
  n=$(node -p "require('./framework/packages/$d/package.json').name"); v=$(node -p "require('./framework/packages/$d/package.json').version")
  [ "$n" = "$(name_of "$d")" ] || die "framework/packages/$d is named $n, expected $(name_of "$d")"
  [ "$v" = "$version" ] || die "$n is $v, the CLI is $version"
  echo "$n $v"
done

work=$(mktemp -d "${TMPDIR:-/tmp}/release-$version.XXXXXX")
cfg_acryldev="$work/acryldev.npmrc"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/packed" "$work/cache"
export npm_config_cache="$work/cache"
tokens() {
  step "tokens (temporary 0600 userconfigs, never printed)"
  ( umask 077
    python3 - "$cfg_acryldev" <<'PY'
import json, os, sys
d = json.load(open(os.path.expanduser('~/.secure-storage/npm/npm.json')))
with open(sys.argv[1], 'w') as f: f.write('//registry.npmjs.org/:_authToken=' + d['npm_accesstoken_acryldevadmin_of_org_acryldev_bypass_2fa'] + '\n')
PY
  )
  echo "acryldev token: $(npm whoami --userconfig "$cfg_acryldev" 2>&1 | tail -1)"
}
# Every public workspace package: name, folder.
git ls-files '*package.json' | grep -v node_modules | while read -r f; do
  node -e 'const m=require(process.argv[1]); if (m.name && !m.private) console.log(m.name + "\t" + require("path").dirname(process.argv[1]))' "$repo/$f" 2>/dev/null || true
done > "$work/workspace.tsv"

if [ "$PROMOTE" = 1 ]; then
  # This release's packages: every public workspace package whose npm `next` is its workspace version. A package an earlier release published, or one
  # this release found on npm already, has another `next` (or none) and is left alone.
  step "promote: the packages whose next is this release's version"
  : > "$work/promote.txt"
  while IFS=$'\t' read -r n dir; do
    v=$(node -p 'require(process.argv[1]).version' "$dir/package.json")
    next=$(npm view "$n" dist-tags.next 2>/dev/null || true)
    [ "$next" = "$v" ] && echo "$n $v" >> "$work/promote.txt"
  done < "$work/workspace.tsv"
  for n in $ALL_NAMES; do grep -q "^$n $version\$" "$work/promote.txt" || die "$n: npm's next is not $version; publish with --tag next first"; done
  echo "$(wc -l < "$work/promote.txt" | tr -d ' ') packages:"; sed 's/^/  /' "$work/promote.txt"
  [ "$GO" = 0 ] || tokens
  while read -r n v; do
    case "$n" in @acryldev/*) c=$cfg_acryldev ;; *) die "$n: no npm account owns it here" ;; esac
    outward npm dist-tag add "$n@$v" latest --userconfig "$c"
    [ "$GO" = 1 ] && echo "$n latest: $(npm view "$n" dist-tags.latest)"
  done < "$work/promote.txt"
  step "done"
  [ "$GO" = 1 ] && echo "latest is $version for every package above" || echo "print-only run; run again with --promote --go to move latest"
  exit 0
fi

step "build (a fresh clone has no lib/: the framework build makes every package this release packs, the frame packages included)"
# The build lock: every package's build rewrites its lib/, so a second build in this checkout (a launcher, a gate) waits instead of colliding.
node scripts/with-build-lock.mjs nice -n 10 corepack pnpm --dir framework run build > "$work/build.log" 2>&1 || { tail -30 "$work/build.log"; die "the framework build failed (log above)"; }
echo "built"

step "pack (pnpm pack turns workspace: ranges into versions; prepack builds)"
for d in "${DIRS[@]}"; do
  (cd "framework/packages/$d" && nice -n 10 corepack pnpm pack --pack-destination "$work/packed" >/dev/null)
done
tgz_of() { echo "$work/packed/$(name_of "$1" | sed 's#^@##; s#/#-#')-$version.tgz"; }
for d in "${DIRS[@]}"; do
  [ -f "$(tgz_of "$d")" ] || die "no tarball $(tgz_of "$d")"
  echo "$(basename "$(tgz_of "$d")") $(du -h "$(tgz_of "$d")" | cut -f1)"
done

step "tarball checks"
# Every "files" entry is in its tarball: a pack that skipped prepack shipped 1.7.1 without docs/ and plugins/.
node scripts/check-tarball-files.mjs "$work"/packed/*.tgz || die "a tarball lacks what its package.json files names (above)"
manifest() { tar -xzOf "$(tgz_of "$1")" package/package.json; }
for d in "${DIRS[@]}"; do
  m=$(manifest "$d")
  echo "$m" | grep -q '"workspace:' && die "$(name_of "$d") still has a workspace: range after packing"
done
# A bin written with import needs "type": "module", or Node warns on every run (MODULE_TYPELESS_PACKAGE_JSON).
for d in "${DIRS[@]}"; do
  type=$(manifest "$d" | node -p 'JSON.parse(require("fs").readFileSync(0)).type ?? ""')
  for bin in $(tar -tzf "$(tgz_of "$d")" | grep '^package/bin/.*\.js$'); do
    if tar -xzOf "$(tgz_of "$d")" "$bin" | grep -q '^import '; then
      [ "$type" = module ] || die "$(name_of "$d"): ${bin#package/} uses import but package.json has no \"type\": \"module\" (Node warns on every run)"
    fi
  done
done
echo "module types ok"
# The dependency closure: an @acryldev dependency that is neither in this release nor on npm at a matching version, but is a workspace
# package, is packed and published first (acryldevadmin token), with its own dependencies before it. Anything still missing stops the release.
ws_dir_of() { awk -F'\t' -v n="$1" '$1 == n { print $2; exit }' "$work/workspace.tsv"; }
deps_of_tgz() { tar -xzOf "$1" package/package.json | node -e 'const d=JSON.parse(require("fs").readFileSync(0)).dependencies??{};for(const[k,v]of Object.entries(d))if(k.startsWith("@acryldev/"))console.log(k+" "+v)'; }
EXTRA=""        # dependency-first order of extra packages to publish
EXTRA_TGZ=""    # their tarballs, same order
# Whether version $1 satisfies $2: the range forms these packages use (exact, ^, ~, >=, workspace:*|^|~).
# shortcut: not full semver (no ||, hyphen ranges or prereleases); upgrade to the semver package if a range ever needs more.
satisfies() {
  node -e '
const [v, r0] = process.argv.slice(1); const r = r0.replace(/^workspace:/, "")
if (r === "*" || r === "") process.exit(0)
const p = (x) => x.split(".").map(Number), [a, b, c] = p(v)
const m = /^(\^|~|>=)?(\d+)\.(\d+)\.(\d+)$/.exec(r); if (!m) { console.error("unsupported range " + r0); process.exit(2) }
const [, op, x, y, z] = [m[0], m[1], +m[2], +m[3], +m[4]]
const ge = a > x || (a === x && (b > y || (b === y && c >= z)))
const ok = op === undefined ? a === x && b === y && c === z : op === ">=" ? ge : op === "~" ? ge && a === x && b === y : ge && (x > 0 ? a === x : y > 0 ? a === 0 && b === y : a === 0 && b === 0 && c === z)
process.exit(ok ? 0 : 1)' "$1" "$2"
}
CHECKED=""      # workspace packages already looked at (on npm and the same, or queued)
UNPACKABLE=""   # print-only: workspace packages whose pack (prepack check) failed, collected so one run lists them all
STALE=""        # on npm at the workspace's version, but the workspace's content differs: needs a new version first
seen() { case " $ALL_NAMES $EXTRA $CHECKED " in *" $1 "*) return 0;; esac; return 1; }
mkdir -p "$work/npm" "$work/cmp"
# A tarball's files with the version field taken out of package.json, so two packs of one release compare equal.
unpack_plain() { # $1 tarball, $2 folder
  mkdir -p "$2" && tar -xzf "$1" -C "$2"
  node -e 'const f=process.argv[1]+"/package/package.json",fs=require("fs"),m=JSON.parse(fs.readFileSync(f));delete m.version;fs.writeFileSync(f,JSON.stringify(m,null,2))' "$2"
}
# STOP on a reference to the CLI by its old short name: `acrylblends` on npm is a deprecated alias with no exports, so `acrylblends/<x>` cannot resolve.
scan() { # $1 tarball
  local d="$work/cmp/scan-$$-$RANDOM"; mkdir -p "$d"; tar -xzf "$1" -C "$d"
  local hits; hits=$(grep -rIlE --include='*.js' --include='*.mjs' --include='*.cjs' --include='*.ts' --include='*.mts' "(from|import\(|require\()[[:space:]]*['\"](acrylblends(/|['\"])|@acrylblends/)" "$d" | sed "s#$d/package/##" | head -5 || true)
  node -e 'const m=require(process.argv[1]); for (const k of ["dependencies","peerDependencies","optionalDependencies"]) for (const n of Object.keys(m[k]??{})) if (n==="acrylblends"||n.startsWith("@acrylblends/")) { console.log(k+" "+n); process.exit(1) }' "$d/package/package.json" >/dev/null || hits="$hits package.json depends on the alias"
  rm -rf "$d"
  [ -z "$hits" ] || die "${1##*/} imports the CLI by the alias acrylblends (no exports): ${hits//$'\n'/, }"
}
pack_ws() { # $1 folder -> prints the tarball
  local before tgz; before=$(ls "$work/packed")
  if ! (cd "$1" && nice -n 10 corepack pnpm pack --pack-destination "$work/packed" >"$work/pack.out" 2>&1); then
    local why; why=$(grep -E "^ FAIL |error TS|AssertionError" "$work/pack.out" | head -3 | tr '\n' ';' || true)
    [ "$GO" = 0 ] || die "packing ${1#$repo/} failed: $why"
    echo "UNPACKABLE ${1#$repo/}: ${why:-see pnpm pack output}" >&2; return 1
  fi
  tgz="$work/packed/$(comm -13 <(echo "$before") <(ls "$work/packed") | head -1)"
  [ -f "$tgz" ] || die "packing ${1#$repo/} made no tarball"
  echo "$tgz"
}
need() { # $1 dependent, $2 dep, $3 range
  local dependent=$1 dep=$2 range=$3 found dir have tgz
  dir=$(ws_dir_of "$dep")
  if seen "$dep"; then
    if [ -n "$dir" ]; then
      have=$(node -p 'require(process.argv[1]).version' "$dir/package.json")
      satisfies "$have" "$range" || die "$dependent needs $dep@$range, but the workspace has $dep $have (${dir#$repo/})"
    fi
    return 0
  fi
  if [ -z "$dir" ]; then
    # Without --json a 404 prints nothing; a range with several matches prints one line each ("name@v 'v'"), so take the last word.
    found=$(npm view "$dep@$range" version 2>/dev/null | tail -1 | awk '{print $NF}' | tr -d "'") || found=""
    [ -n "$found" ] || die "$dependent needs $dep@$range: not on npm and not a workspace package"
    echo "$dependent -> $dep@$range: on npm ($found), not a workspace package"; return 0
  fi
  CHECKED="$CHECKED $dep"
  # The workspace's version must be one the range accepts, or what is published leaves the dependent uninstallable.
  have=$(node -p 'require(process.argv[1]).version' "$dir/package.json")
  satisfies "$have" "$range" || die "$dependent needs $dep@$range, but the workspace has $dep $have (${dir#$repo/})"
  if ! tgz=$(pack_ws "$dir"); then UNPACKABLE="$UNPACKABLE $dep"; echo "$dependent -> $dep@$have: its pack failed (listed at the end)"; return 0; fi
  scan "$tgz"
  local sub subrange
  while read -r sub subrange; do [ -n "$sub" ] && need "$dep" "$sub" "$subrange"; done < <(deps_of_tgz "$tgz")
  if npm view "$dep@$have" version >/dev/null 2>&1; then
    local theirs; theirs=$(cd "$work/npm" && npm pack "$dep@$have" --silent 2>/dev/null | tail -1 || true)
    [ -f "$work/npm/$theirs" ] || die "could not download $dep@$have from npm to compare"
    rm -rf "$work/cmp/a" "$work/cmp/b"; unpack_plain "$tgz" "$work/cmp/a"; unpack_plain "$work/npm/$theirs" "$work/cmp/b"
    local differ; differ=$(diff -rq "$work/cmp/a/package" "$work/cmp/b/package" 2>&1 | wc -l | tr -d ' ' || true)
    if [ "$differ" = 0 ]; then echo "$dependent -> $dep@$have: on npm, the same content"
    else
      echo "$dependent -> $dep@$have: on npm, but $differ files differ from the workspace's (${dir#$repo/})"
      STALE="$STALE $dep@$have"
    fi
  else
    echo "$dependent -> $dep@$have: not on npm; packed ${tgz##*/} from ${dir#$repo/}"
    EXTRA="$EXTRA $dep"; EXTRA_TGZ="$EXTRA_TGZ $tgz"
  fi
}
for d in "${DIRS[@]}"; do
  scan "$(tgz_of "$d")"
  while read -r dep range; do [ -n "$dep" ] && need "$(name_of "$d")" "$dep" "$range"; done < <(deps_of_tgz "$(tgz_of "$d")")
done
# Every @acryldev package a library plugin declares in its plugin.json: init and add write those into the app at the range given there.
while read -r dep range; do [ -n "$dep" ] && need "a library plugin" "$dep" "$range"; done < <(
  for f in plugins/*/plugin.json; do node -e 'for (const [k, v] of Object.entries(require(process.argv[1]).dependencies ?? {})) if (k.startsWith("@acryldev/")) console.log(k + " " + v)' "$repo/$f"; done | sort -u)
# What a new app installs without the CLI depending on it (spec 051 T011, library.ts PACKAGED): the instance and the desktop shell, at their exact
# workspace versions.
for root in @acryldev/instance @acryldev/desktop-shell; do
  dir=$(ws_dir_of "$root"); [ -n "$dir" ] || die "$root is not a workspace package"
  need "a new app" "$root" "$(node -p 'require(process.argv[1]).version' "$dir/package.json")"
done
# The frame (an app made with the frame on): frame/packages.json names each package and the version init writes; it must be the workspace's.
while read -r dep ver path; do
  [ -n "$dep" ] || continue
  wsv=$(node -p 'require(process.argv[1]).version' "$repo/framework/$path/package.json")
  [ "$wsv" = "$ver" ] || die "framework/frame/packages.json says $dep $ver, the workspace has $wsv: keep them in step"
  need "the frame" "$dep" "$ver"
done < <(node -e 'for (const [n, e] of Object.entries(require(process.argv[1]).packages)) console.log(n + " " + e.version + " " + e.path)' "$repo/framework/frame/packages.json")
# The templates (their own @acryldev dependencies; a placeholder like __ACRYLBLENDS_RANGE__ is the CLI, checked above).
while read -r who dep range; do [ -n "$dep" ] && need "$who" "$dep" "$range"; done < <(
  for f in framework/packages/cli/templates/*/package.json; do
    node -e 'const f=process.argv[1]; for (const [k, v] of Object.entries(require(f).dependencies ?? {})) if (k.startsWith("@acryldev/") && !v.startsWith("__")) console.log(f.split("/").slice(-2, -1)[0] + " " + k + " " + v)' "$repo/$f"
  done | sort -u)
[ -z "$UNPACKABLE" ] || echo "unpackable (their prepack check fails):$UNPACKABLE"
if [ -n "$STALE" ]; then
  for s in $STALE; do
    n=${s%@*}; v=${s##*@}; IFS=. read -r ma mi _ <<< "$v"
    echo "stale: $n $v -> needs $ma.$((mi + 1)).0 in its package.json (and framework/frame/packages.json if it is a frame package), then a new run"
  done
fi
[ -z "$STALE$UNPACKABLE" ] || die "$(echo $STALE | wc -w | tr -d ' ') stale and $(echo $UNPACKABLE | wc -w | tr -d ' ') unpackable packages (listed above)"
for t in $EXTRA_TGZ; do
  n=$(tar -xzOf "$t" package/package.json | node -p 'JSON.parse(require("fs").readFileSync(0)).name')
  v=$(tar -xzOf "$t" package/package.json | node -p 'JSON.parse(require("fs").readFileSync(0)).version')
  case "$n" in @acryldev/*) ;; *) die "$n would be published first but is not an @acryldev package";; esac
  tar -xzOf "$t" package/package.json | grep -q '"workspace:' && die "$n still has a workspace: range after packing"
  if npm view "$n@$v" version >/dev/null 2>&1; then die "$n@$v is already on npm but does not match what the release needs"; fi
done
[ -n "$EXTRA" ] && echo "published before the CLI, in this order:$EXTRA" || echo "every @acryldev dependency is already on npm"
# Not already published (npm refuses to publish over a version).
for d in "${DIRS[@]}"; do
  if npm view "$(name_of "$d")@$version" version >/dev/null 2>&1; then die "$(name_of "$d")@$version is already on npm"; fi
done
echo "neither is on npm at $version yet"

tokens
cfg() { echo "$cfg_acryldev"; }

step "publish (missing @acryldev dependencies, then the two)"
# `npm publish` does not need a package's dependencies visible (the registry lags a few minutes), so nothing waits per package (28 packages took over an
# hour that way, spec 051 T040): every published name@version is recorded here and waited for once, after the last publish, before the tags and the proofs.
PUBLISHED=()
visible() { # $1 name, $2 version: wait for the registry (a dependent installed before it would fail)
  for _ in $(seq 1 20); do npm view "$1@$2" version >/dev/null 2>&1 && break; sleep 20; done
  npm view "$1@$2" version >/dev/null 2>&1 || die "$1@$2 not visible on npm after 6 min"
  echo "$1@$2 is on npm"
}
for t in $EXTRA_TGZ; do
  outward npm publish "$t" --access public --tag "$TAG" --userconfig "$cfg_acryldev"
  [ "$GO" = 1 ] && PUBLISHED+=("$(tar -xzOf "$t" package/package.json | node -p 'const p=JSON.parse(require("fs").readFileSync(0));p.name+"@"+p.version')")
done
for d in "${DIRS[@]}"; do
  outward npm publish "$(tgz_of "$d")" --access public --tag "$TAG" --userconfig "$(cfg "$d")"
  [ "$GO" = 1 ] && PUBLISHED+=("$(name_of "$d")@$version")
done
if [ "$GO" = 1 ]; then
  step "visible on npm: every published name@version, once"
  for nv in "${PUBLISHED[@]}"; do visible "${nv%@*}" "${nv##*@}"; done
fi

step "tags (framework-release.yml runs on blends-v* and create-blends-v*; its publish would only fail now, so those runs are cancelled)"
for d in cli create; do
  t="$(tag_of "$d")$version"
  outward git tag "$t" "$commit"
  outward git push git@github.com:acryldev/acryl.git "refs/tags/$t"
done
if [ "$GO" = 1 ]; then
  for d in cli create; do
    t="$(tag_of "$d")$version"; cancelled=0
    for _ in $(seq 1 8); do
      for id in $(gh run list --repo acryldev/acryl --workflow framework-release.yml --event push --limit 20 --json databaseId,headBranch,status \
        --jq ".[] | select(.headBranch == \"$t\" and .status != \"completed\") | .databaseId"); do
        gh run cancel --repo acryldev/acryl "$id" && echo "cancelled run $id ($t)" && cancelled=1
      done
      [ "$cancelled" = 1 ] && break
      sleep 30
    done
    [ "$cancelled" = 1 ] || echo "note: no running framework-release run found for $t within 4 min; check: gh run list --workflow framework-release.yml"
  done
else
  echo "would cancel: every framework-release.yml run whose head is blends-v$version or create-blends-v$version (gh run list ... | gh run cancel)"
fi

step "proof from npm: the create command in a scratch HOME, plus the CLI"
prove() { # $1 label, rest: the npm create arguments
  local label=$1; shift
  local home="$work/proof-$label"; mkdir -p "$home"
  if [ "$GO" = 0 ]; then echo "would run in an empty HOME: npm create -y $* my-app -- --template blank"; return; fi
  (cd "$home" && env -u ACRYL_HOME -u ELECTRON_RUN_AS_NODE HOME="$home" npm_config_cache="$home/.npm" npm create -y "$@" my-app -- --template blank > create.log 2>&1) ||
    { tail -20 "$home/create.log"; die "$label: npm create failed"; }
  grep -q 'MODULE_TYPELESS\|Module type of file' "$home/create.log" && die "$label: Node warned about the module type"
  [ -f "$home/my-app/package.json" ] && [ -f "$home/my-app/blend.yaml" ] || die "$label: no app made"
  grep -q '"@webboxes/' "$home/my-app/package.json" && die "$label: the new app still depends on @webboxes packages"
  echo "$label: app made, depends on: $(node -p "Object.keys(require('$home/my-app/package.json').dependencies).filter(k=>k.startsWith('@acryldev/')).length") @acryldev packages, no @webboxes"
}
prove scoped "@acryldev/blends@$version"
if [ "$GO" = 1 ]; then
  home="$work/proof-cli"; mkdir -p "$home"
  got=$(cd "$home" && HOME="$home" npm_config_cache="$home/.npm" npm exec --yes "@acryldev/blends@$version" -- --version 2>&1 | tail -1)
  [ "$got" = "$version" ] || die "npx @acryldev/blends@$version --version printed '$got'"
  echo "@acryldev/blends@$version --version: $got"
else
  echo "would run in an empty HOME: npm exec --yes @acryldev/blends@$version -- --version (expect $version)"
fi

step "done"
[ "$GO" = 1 ] && echo "release $version published under the npm tag $TAG, tagged and proven from npm" || echo "print-only run: every check passed; run again with --go to release $version (npm tag $TAG)"
