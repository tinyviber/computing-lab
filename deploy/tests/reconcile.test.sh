#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/deploy/reconcile.sh"
FLOCK_HELPER="$ROOT/deploy/tests/flock-helper.py"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

pass() { printf 'ok - %s\n' "$1"; }
fail() { printf 'not ok - %s\n' "$1" >&2; exit 1; }
expect_fail() { if "$@" >/dev/null 2>&1; then return 1; fi; }

mkdir -p "$TMP/bin" "$TMP/host"
chmod +x "$FLOCK_HELPER"

cat >"$TMP/bin/bun" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
metrics="__METRICS__"
if [[ "${1:-}" == "--version" ]]; then
  printf '%s\n' "${FAKE_BUN_VERSION:-1.2.17}"
  exit 0
fi
if [[ "${1:-}" == "install" ]]; then
  printf 'install\n' >>"$metrics"
  [[ ! -e install.fail ]] || exit 41
  mkdir -p node_modules
  exit 0
fi
if [[ "${1:-}" == "run" && "${2:-}" == "build" ]]; then
  printf 'build\n' >>"$metrics"
  [[ ! -e build.fail ]] || exit 42
  if [[ -e build.pause ]]; then
    : >build.ready
    while [[ ! -e build.continue ]]; do sleep 0.02; done
  fi
  marker="$(cat release-marker)"
  base="${VITE_BASE_PATH:-/}"
  asset="${base%/}/assets/app.js"
  [[ "$base" != "/" ]] || asset="/assets/app.js"
  mkdir -p dist/assets
  printf '<div id="root">%s</div><script src="%s"></script>\n' "$marker" "$asset" >dist/index.html
  printf '%s\n' "$marker" >dist/assets/app.js
  exit 0
fi
if [[ "${1:-}" == *.mjs ]]; then
  printf 'smoke\n' >>"$metrics"
  [[ ! -e smoke.fail ]] || exit 43
  [[ -f "${2:-}/index.html" ]] || exit 44
  exit 0
fi
exit 45
EOF
python3 - "$TMP/bin/bun" "$TMP/metrics" <<'PY'
from pathlib import Path
import sys

script = Path(sys.argv[1])
script.write_text(script.read_text().replace("__METRICS__", sys.argv[2]))
PY
chmod +x "$TMP/bin/bun"

cat >"$TMP/config.env" <<EOF
DEPLOY_ROOT=$TMP/host
GITEE_REMOTE=$TMP/gitee.git
GITEE_REF=main
BUN_BIN=$TMP/bin/bun
PYTHON_BIN=$(command -v python3)
FLOCK_BIN=$FLOCK_HELPER
VITE_BASE_PATH=/
KEEP_RELEASES=1
EOF

git init --bare "$TMP/gitee.git" >/dev/null
git clone "$TMP/gitee.git" "$TMP/source" >/dev/null 2>&1
git -C "$TMP/source" config user.email test@example.invalid
git -C "$TMP/source" config user.name test
mkdir -p "$TMP/source/deploy"
cp "$ROOT/deploy/smoke.mjs" "$TMP/source/deploy/smoke.mjs"
printf '{"name":"fixture","scripts":{"build":"fixture"}}\n' >"$TMP/source/package.json"
printf 'fixture-lock\n' >"$TMP/source/bun.lock"

commit_fixture() {
  local marker="$1" message="$2"
  printf '%s\n' "$marker" >"$TMP/source/release-marker"
  git -C "$TMP/source" add .
  git -C "$TMP/source" commit -m "$message" >/dev/null
  git -C "$TMP/source" push origin HEAD:main >/dev/null
  git -C "$TMP/source" rev-parse HEAD
}

run_deploy() { DEPLOY_CONFIG="$TMP/config.env" bash "$SCRIPT" reconcile; }
run_cmd() { DEPLOY_CONFIG="$TMP/config.env" bash "$SCRIPT" "$@"; }
current_target() { readlink "$TMP/host/current"; }
previous_target() { [[ -L "$TMP/host/previous" ]] && readlink "$TMP/host/previous" || true; }
snapshot() {
  printf '%s\n' "$(current_target 2>/dev/null || true)" "$(previous_target)" \
    "$(cat "$TMP/host/state/current.sha" 2>/dev/null || true)" \
    "$(cat "$TMP/host/state/previous.sha" 2>/dev/null || true)" \
    "$(test -e "$TMP/host/state/transaction" && echo tx || true)"
}

sha1="$(commit_fixture one initial)"
run_deploy
[[ "$(current_target)" == "$TMP/host/releases/$sha1" ]] || fail 'initial exact-SHA publish'
[[ -f "$TMP/host/releases/$sha1/dist/index.html" && ! -d "$TMP/host/releases/$sha1/node_modules" ]] || fail 'release contains static payload only'
pass 'initial exact-SHA publish'

before_metrics="$(wc -l <"$TMP/metrics" | tr -d ' ')"
before_snapshot="$(snapshot)"
run_deploy
[[ "$(wc -l <"$TMP/metrics" | tr -d ' ')" == "$before_metrics" ]] || fail 'same-SHA did build'
[[ "$(snapshot)" == "$before_snapshot" ]] || fail 'same-SHA mutated state'
pass 'same-SHA strict idempotency'

printf 'build-fail\n' >"$TMP/source/release-marker"
: >"$TMP/source/build.fail"
git -C "$TMP/source" add .
git -C "$TMP/source" commit -m build-failure >/dev/null
git -C "$TMP/source" push origin HEAD:main >/dev/null
sha_build_fail="$(git -C "$TMP/source" rev-parse HEAD)"
before_snapshot="$(snapshot)"
expect_fail run_deploy || fail 'build failure was accepted'
[[ "$(snapshot)" == "$before_snapshot" ]] || fail 'build failure mutated production state'
[[ ! -e "$TMP/host/releases/$sha_build_fail" ]] || fail 'build failure left candidate release'
pass 'build failure preserves current and previous'

rm -f "$TMP/source/build.fail"
printf 'smoke-fail\n' >"$TMP/source/release-marker"
: >"$TMP/source/smoke.fail"
git -C "$TMP/source" add .
git -C "$TMP/source" commit -m smoke-failure >/dev/null
git -C "$TMP/source" push origin HEAD:main >/dev/null
sha_smoke_fail="$(git -C "$TMP/source" rev-parse HEAD)"
before_snapshot="$(snapshot)"
expect_fail run_deploy || fail 'smoke failure was accepted'
[[ "$(snapshot)" == "$before_snapshot" ]] || fail 'smoke failure mutated production state'
[[ ! -e "$TMP/host/releases/$sha_smoke_fail" ]] || fail 'smoke failure left candidate release'
pass 'smoke failure preserves current and previous'

rm -f "$TMP/source/smoke.fail"
sha2="$(commit_fixture two second)"
run_deploy
[[ "$(current_target)" == "$TMP/host/releases/$sha2" ]] || fail 'second publish failed'
[[ "$(previous_target)" == "$TMP/host/releases/$sha1" ]] || fail 'previous marker target wrong'
pass 'previous marker tracks prior release'

sha_atomic="$(commit_fixture atomic atomic-publish)"
reader_failed="$TMP/reader.failed"
(
  for _ in {1..2000}; do
    target="$(readlink "$TMP/host/current" 2>/dev/null || true)"
    [[ "$target" =~ /releases/[0-9a-f]{40}$ && -f "$target/dist/index.html" && -f "$target/release.env" ]] \
      || { : >"$reader_failed"; exit 1; }
  done
) &
reader_pid=$!
run_deploy
wait "$reader_pid"
[[ ! -e "$reader_failed" ]] || fail 'reader observed missing or partial current release'
[[ "$(current_target)" == "$TMP/host/releases/$sha_atomic" ]] || fail 'atomic publish target wrong'
[[ "$(previous_target)" == "$TMP/host/releases/$sha2" ]] || fail 'atomic publish previous target wrong'
pass 'atomic current switch exposes complete release only'

printf 'paused\n' >"$TMP/source/release-marker"
: >"$TMP/source/build.pause"
git -C "$TMP/source" add .
git -C "$TMP/source" commit -m paused-build >/dev/null
git -C "$TMP/source" push origin HEAD:main >/dev/null
sha_pause="$(git -C "$TMP/source" rev-parse HEAD)"
run_deploy >"$TMP/paused.log" 2>&1 &
deploy_pid=$!
for _ in {1..200}; do find "$TMP/host/work" -path "*/source/build.ready" -print -quit | grep -q . && break; sleep 0.02; done
paused_ready="$(find "$TMP/host/work" -path "*/source/build.ready" -print -quit)"
[[ -n "$paused_ready" ]] || fail 'paused build did not reach staging'
expect_fail run_deploy || fail 'concurrent deployment was accepted'
: >"$(dirname "$paused_ready")/build.continue"
wait "$deploy_pid"
rm -f "$TMP/source/build.pause" "$TMP/source/build.continue"
pass 'concurrent deployment rejected by lock'

printf 'stale\n' >"$TMP/source/release-marker"
: >"$TMP/source/build.pause"
git -C "$TMP/source" add .
git -C "$TMP/source" commit -m stale-build >/dev/null
git -C "$TMP/source" push origin HEAD:main >/dev/null
sha_stale="$(git -C "$TMP/source" rev-parse HEAD)"
before_snapshot="$(snapshot)"
run_deploy >"$TMP/stale.log" 2>&1 &
stale_pid=$!
for _ in {1..200}; do find "$TMP/host/work" -path "*/source/build.ready" -print -quit | grep -q . && break; sleep 0.02; done
stale_ready="$(find "$TMP/host/work" -path "*/source/build.ready" -print -quit)"
[[ -n "$stale_ready" ]] || fail 'stale build did not reach staging'
printf '%s\n' newer >"$TMP/source/release-marker"
rm -f "$TMP/source/build.pause"
git -C "$TMP/source" add .
git -C "$TMP/source" commit -m moved-main >/dev/null
git -C "$TMP/source" push origin HEAD:main >/dev/null
: >"$(dirname "$stale_ready")/build.continue"
expect_fail wait "$stale_pid" || fail 'moving Gitee ref was accepted'
[[ "$(snapshot)" == "$before_snapshot" ]] || fail 'stale Gitee ref mutated production state'
pass 'Gitee ref movement during build refuses stale publish'

run_cmd rollback
[[ "$(current_target)" == "$TMP/host/releases/$sha_atomic" ]] || fail 'rollback current target'
[[ -e "$TMP/host/state/hold" ]] || fail 'rollback did not create hold'
held_snapshot="$(snapshot)"
run_deploy
[[ "$(snapshot)" == "$held_snapshot" ]] || fail 'hold did not stop timer reconcile'
run_cmd resume
pass 'rollback swaps and holds automatic reconcile'

invalid="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
mkdir -p "$TMP/host/releases/$invalid"
printf 'broken\n' >"$TMP/host/releases/$invalid/garbage"
run_cmd cleanup
quarantined="$(find "$TMP/host/quarantine" -mindepth 1 -maxdepth 1 -type d -print -quit)"
[[ ! -e "$TMP/host/releases/$invalid" && -n "$quarantined" ]] || fail 'invalid release was not quarantined'
[[ -e "$(current_target)/dist/index.html" && -e "$(previous_target)/dist/index.html" ]] || fail 'cleanup removed rollback target'
pass 'cleanup protects current and previous'

sha_recovery="$(commit_fixture recovery recovery)"
DEPLOY_TEST_FAIL_PHASE=after-current DEPLOY_CONFIG="$TMP/config.env" bash "$SCRIPT" reconcile >/dev/null 2>&1 || true
[[ -e "$TMP/host/state/transaction" ]] || fail 'crash phase did not leave transaction intent'
run_deploy
[[ ! -e "$TMP/host/state/transaction" && "$(current_target)" == "$TMP/host/releases/$sha_recovery" ]] || fail 'transaction recovery failed'
pass 'transaction recovery repairs interrupted current switch'

grep -Fq 'handle_path /computing-lab/*' "$ROOT/deploy/Caddyfile.example" || fail 'Caddy subpath handler missing'
grep -Fq 'not path /assets/*' "$ROOT/deploy/Caddyfile.example" || fail 'Caddy asset exclusion missing'
grep -Fq 'rewrite @spa /index.html' "$ROOT/deploy/Caddyfile.example" || fail 'Caddy SPA fallback missing'
pass 'Caddy template contract'

symlink_root="$TMP/symlink-host"
mkdir -p "$symlink_root" "$TMP/outside"
ln -s "$TMP/outside" "$symlink_root/releases"
cat >"$TMP/symlink-config.env" <<EOF
DEPLOY_ROOT=$symlink_root
GITEE_REMOTE=$TMP/gitee.git
GITEE_REF=main
BUN_BIN=$TMP/bin/bun
PYTHON_BIN=$(command -v python3)
FLOCK_BIN=$FLOCK_HELPER
VITE_BASE_PATH=/
KEEP_RELEASES=1
EOF
expect_fail env DEPLOY_CONFIG="$TMP/symlink-config.env" bash "$SCRIPT" status \
  || fail 'symlinked deployment child was accepted'
pass 'deployment child symlink rejected'

lock_root="$TMP/lock-host"
mkdir -p "$lock_root/state"
ln -s "$TMP/outside" "$lock_root/state/deploy.lock"
cat >"$TMP/lock-config.env" <<EOF
DEPLOY_ROOT=$lock_root
GITEE_REMOTE=$TMP/gitee.git
GITEE_REF=main
BUN_BIN=$TMP/bin/bun
PYTHON_BIN=$(command -v python3)
FLOCK_BIN=$FLOCK_HELPER
VITE_BASE_PATH=/
KEEP_RELEASES=1
EOF
expect_fail env DEPLOY_CONFIG="$TMP/lock-config.env" bash "$SCRIPT" status \
  || fail 'symlinked deployment lock was accepted'
pass 'deployment lock symlink rejected'

printf '%s\n' invalid >>"$TMP/host/state/current.sha"
expect_fail run_cmd reconcile || fail 'extra marker content was accepted'
python3 - "$TMP/host/state/current.sha" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
path.write_text(path.read_text().splitlines()[0] + "\n")
PY
pass 'extra marker content rejected'

cp "$(current_target)/release.env" "$TMP/release.env.good"
python3 - "$(current_target)/release.env" "$TMP/release.env.good" <<'PY'
from pathlib import Path
import sys

path, target = map(Path, sys.argv[1:])
path.unlink()
path.symlink_to(target)
PY
expect_fail run_cmd reconcile || fail 'release metadata symlink was accepted'
python3 - "$(current_target)/release.env" "$TMP/release.env.good" <<'PY'
from pathlib import Path
import sys

path, target = map(Path, sys.argv[1:])
path.unlink()
path.write_bytes(target.read_bytes())
PY
pass 'release metadata symlink rejected'

printf 'SMOKE=pass\n' >>"$(current_target)/release.env"
expect_fail run_cmd reconcile || fail 'duplicate release metadata was accepted'
pass 'duplicate release metadata rejected'

printf 'deploy tests: all scenarios passed\n'
