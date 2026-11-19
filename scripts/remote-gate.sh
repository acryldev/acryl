#!/usr/bin/env bash
# The full check (`pnpm run check`) of one commit on our own Linux machine, z370n, instead of the main Mac (owner, 2026-11-19).
#   scripts/remote-gate.sh <commit, branch or tag>        e.g. scripts/remote-gate.sh HEAD   |   scripts/remote-gate.sh 051-t021
# The commit need not be pushed: it travels as a `git bundle` made here, so a branch is checked before it is pushed (gate, then push).
# On z370n each run gets its own folder (the clone and an empty HOME) under ~/_projects/acryl-gates/runs, runs at nice 19 with a portable
# Node 24 and the repository's own pnpm (corepack), and is deleted afterwards; the log comes back here. At most two runs at once there.
# The pnpm store (content-addressed, so safe to share) stays in ~/_projects/acryl-gates/pnpm-store: a run downloads only what is new.
# Prints the run's last lines and ends with `GATE_EXIT=<code>` (0 = green), the pass line a gate report quotes; exits with that code.
# GATE_HOST=user@host and GATE_KEY=<ssh key> point it at another machine.
set -euo pipefail

ref=${1:?usage: scripts/remote-gate.sh <commit, branch or tag>}
host=${GATE_HOST:-z370n@192.168.178.33}
key=${GATE_KEY:-$HOME/.ssh/4agents/z370n4agents/z370n4agents}
node_version=v24.19.0
base='~/_projects/acryl-gates'
ssh_=(ssh -o BatchMode=yes -o IdentitiesOnly=yes -o ServerAliveInterval=30 -i "$key" "$host")
scp_=(scp -q -o BatchMode=yes -o IdentitiesOnly=yes -i "$key")

repo=$(git rev-parse --show-toplevel)
commit=$(git -C "$repo" rev-parse --verify "$ref^{commit}")
run="$(date +%Y%m%d-%H%M%S)-${commit:0:8}-$$"
local_dir=$(mktemp -d "${TMPDIR:-/tmp}/remote-gate.XXXXXX")
trap 'rm -rf "$local_dir"' EXIT

# The commit as a bundle under a branch name of its own, so the clone can check it out.
git -C "$repo" branch -f "gate/$run" "$commit" >/dev/null
git -C "$repo" bundle create -q "$local_dir/gate.bundle" "gate/$run"
git -C "$repo" branch -D "gate/$run" >/dev/null

"${ssh_[@]}" "mkdir -p $base/runs/$run"
"${scp_[@]}" "$local_dir/gate.bundle" "$host:_projects/acryl-gates/runs/$run/gate.bundle"

# The run itself, on the host. Started detached so a dropped ssh does not end it; this side waits on its marker.
"${ssh_[@]}" "bash -s" <<EOF
set -eu
base=\$HOME/_projects/acryl-gates; run=\$base/runs/$run
running=\$(ls \$base/runs/*/RUNNING 2>/dev/null | wc -l)
if [ "\$running" -ge 2 ]; then echo "remote-gate: two runs are already going on this machine; try again later"; rm -rf "\$run"; exit 75; fi
# Node once per machine, in the gates folder (the system's Node is older than ACRYL needs).
node=\$base/node-$node_version-linux-x64
if [ ! -x \$node/bin/node ]; then
  curl -fsSL https://nodejs.org/dist/$node_version/node-$node_version-linux-x64.tar.xz | tar -xJ -C \$base
fi
cat > \$run/gate.sh <<'INNER'
#!/usr/bin/env bash
set -u
run=\$1; node=\$2
touch \$run/RUNNING
export HOME=\$run/home XDG_CONFIG_HOME=\$run/home/.config XDG_CACHE_HOME=\$run/home/.cache XDG_DATA_HOME=\$run/home/.local/share
export PATH=\$run/bin:\$node/bin:/usr/bin:/bin COREPACK_ENABLE_DOWNLOAD_PROMPT=0 CI=1
# bash, as on a CI runner: the account's zsh with an empty HOME opens its first-run wizard inside the terminal tests (zsh-newuser-install).
export SHELL=/bin/bash
mkdir -p \$HOME \$run/bin
# The check's own scripts call a bare `pnpm` (the guard, nested steps): corepack's shims, pinned by the repository's packageManager.
corepack enable --install-directory \$run/bin pnpm
code=0
{
  git clone -q --branch gate/$run \$run/gate.bundle \$run/acryl && cd \$run/acryl && git rev-parse HEAD &&
  git remote set-url origin https://github.com/acryldev/acryl.git &&
  git submodule -q update --init --recursive &&
  nice -n 19 corepack pnpm install --frozen-lockfile --store-dir "\$(dirname "\$(dirname "\$run")")/pnpm-store" &&
  nice -n 19 node scripts/with-build-lock.mjs corepack pnpm run check
} > \$run/check.log 2>&1 || code=\$?
echo "GATE_EXIT=\$code" >> \$run/check.log
echo \$code > \$run/DONE
rm -f \$run/RUNNING
INNER
chmod +x \$run/gate.sh
setsid nohup \$run/gate.sh \$run \$node > /dev/null 2>&1 < /dev/null &
echo "remote-gate: run $run started on \$(hostname) for $commit"
EOF

# Wait for the marker; a minute between looks (a run takes many minutes, and a tight loop only loads both machines).
started=$(date +%s)
until "${ssh_[@]}" "test -f $base/runs/$run/DONE"; do
  sleep 60
  if [ $(( $(date +%s) - started )) -gt 10800 ]; then echo "remote-gate: no result after 3 hours; the run is left in $base/runs/$run"; exit 124; fi
done
"${scp_[@]}" "$host:_projects/acryl-gates/runs/$run/check.log" "$local_dir/check.log"
code=$("${ssh_[@]}" "cat $base/runs/$run/DONE")
"${ssh_[@]}" "rm -rf $base/runs/$run"
log="${GATE_LOG:-$repo/.git/remote-gate-${commit:0:8}.log}"
cp "$local_dir/check.log" "$log"
tail -n 15 "$log"
echo "remote-gate: $commit on $host, $(( ($(date +%s) - started) / 60 )) min, full log $log"
exit "$code"
