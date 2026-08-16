#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/deploy/reconcile.sh"
FLOCK_HELPER="$ROOT/deploy/tests/flock-helper.py"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
REAL_GIT="$(command -v git)"
REAL_BUN="$(command -v bun)"
ORIGINAL_PATH="$PATH"
TRACE_DIR="$TMP/traces"
mkdir -p "$TRACE_DIR"

pass() { printf 'ok - %s\n' "$1"; }
fail() { printf 'not ok - %s\n' "$1" >&2; exit 1; }
expect_fail() { if "$@" >/dev/null 2>&1; then return 1; fi; }

mkdir -p "$TMP/bin" "$TMP/host"
chmod +x "$FLOCK_HELPER"
[[ -n "$REAL_BUN" ]] || fail 'bun is required for artifact smoke fixtures'

cat >"$TMP/bin/bun" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
metrics="__METRICS__"
env_log="__BUN_ENV_LOG__"
leaks="__LEAKS__"
assert_clean_env() {
  printf 'TRACE_RUN=%s GIT_SSH_COMMAND=%s GITEE_SSH_CONFIG=%s GITEE_SSH_KEY=%s GITEE_KNOWN_HOSTS=%s SSH_AUTH_SOCK=%s\n' \
    "${TRACE_RUN:-none}" "${GIT_SSH_COMMAND:-}" "${GITEE_SSH_CONFIG:-}" "${GITEE_SSH_KEY:-}" \
    "${GITEE_KNOWN_HOSTS:-}" "${SSH_AUTH_SOCK:-}" >>"$env_log"
  for name in GIT_SSH_COMMAND GITEE_SSH_CONFIG GITEE_SSH_KEY GITEE_KNOWN_HOSTS SSH_AUTH_SOCK; do
    [[ -z "${!name:-}" ]] || { printf '%s\n' "$name" >>"$leaks"; exit 46; }
  done
}
if [[ "${1:-}" == "--version" ]]; then
  printf '%s\n' "${FAKE_BUN_VERSION:-1.2.17}"
  exit 0
fi
if [[ "${1:-}" == "install" ]]; then
  assert_clean_env
  printf 'install\n' >>"$metrics"
  [[ ! -e install.fail ]] || exit 41
  mkdir -p node_modules
  exit 0
fi
if [[ "${1:-}" == "run" && "${2:-}" == "build" ]]; then
  assert_clean_env
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
  assert_clean_env
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

python3 - "$TMP/bin/bun" "$TMP/bun-env.log" "$TMP/leaks" <<'PY'
from pathlib import Path
import sys

script = Path(sys.argv[1])
text = script.read_text()
text = text.replace('"__BUN_ENV_LOG__"', repr(sys.argv[2]))
text = text.replace('"__LEAKS__"', repr(sys.argv[3]))
script.write_text(text)
PY

GITEE_SSH_HOST=computing-lab-gitee
GITEE_SSH_CONFIG="$TMP/gitee_ssh_config"
GITEE_SSH_KEY="$TMP/gitee-readonly"
GITEE_KNOWN_HOSTS="$TMP/known_hosts"
SSH_BIN="$(command -v ssh)"
printf 'fixture-private-key\n' >"$GITEE_SSH_KEY"
chmod 600 "$GITEE_SSH_KEY"
cat >"$GITEE_SSH_CONFIG" <<EOF
Host $GITEE_SSH_HOST
    HostName example.invalid
    User git
    IdentityFile $GITEE_SSH_KEY
    IdentitiesOnly yes
    UserKnownHostsFile $GITEE_KNOWN_HOSTS
    StrictHostKeyChecking yes
    BatchMode yes
EOF
printf 'example.invalid ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFixture\n' >"$GITEE_KNOWN_HOSTS"
chmod 640 "$GITEE_SSH_CONFIG" "$GITEE_KNOWN_HOSTS"

synthetic_remote='git@computing-lab-gitee:OWNER/computing-lab.git'
cat >"$TMP/bin/git" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
real_git="__REAL_GIT__"
synthetic_remote="__SYNTHETIC_REMOTE__"
local_remote="__LOCAL_REMOTE__"
trace_dir="__TRACE_DIR__"
operation="${1:-}"
if [[ "$operation" == --git-dir=* ]]; then operation="${2:-}"; fi
trace_file="$trace_dir/${TRACE_RUN:-none}.log"
printf 'operation=%s\nargs=%s\nGIT_SSH_COMMAND=%s\nSSH_AUTH_SOCK=%s\n' \
  "$operation" "$*" "${GIT_SSH_COMMAND:-}" "${SSH_AUTH_SOCK:-}" >>"$trace_file"
args=("$@")
for index in "${!args[@]}"; do
  [[ "${args[$index]}" == "$synthetic_remote" ]] && args[$index]="$local_remote"
done
exec "$real_git" "${args[@]}"
EOF
python3 - "$TMP/bin/git" "$REAL_GIT" "$synthetic_remote" "$TMP/gitee.git" "$TRACE_DIR" <<'PY'
from pathlib import Path
import sys

script = Path(sys.argv[1])
text = script.read_text()
for placeholder, value in zip(
    ("__REAL_GIT__", "__SYNTHETIC_REMOTE__", "__LOCAL_REMOTE__", "__TRACE_DIR__"),
    sys.argv[2:],
):
    text = text.replace(placeholder, value)
script.write_text(text)
PY
chmod +x "$TMP/bin/git"

cat >"$TMP/config.env" <<EOF
DEPLOY_ROOT=$TMP/host
GITEE_REMOTE=$synthetic_remote
GITEE_REF=main
GITEE_SSH_HOST=$GITEE_SSH_HOST
GITEE_SSH_CONFIG=$GITEE_SSH_CONFIG
GITEE_SSH_KEY=$GITEE_SSH_KEY
GITEE_KNOWN_HOSTS=$GITEE_KNOWN_HOSTS
SSH_BIN=$SSH_BIN
BUN_BIN=$TMP/bin/bun
PYTHON_BIN=$(command -v python3)
FLOCK_BIN=$FLOCK_HELPER
VITE_BASE_PATH=/
KEEP_RELEASES=1
EOF
cp "$TMP/config.env" "$TMP/manual.env"
cp "$TMP/config.env" "$TMP/systemd.env"

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

clean_env_prefix() {
  env -u GIT_SSH_COMMAND -u GITEE_SSH_CONFIG -u GITEE_SSH_KEY -u GITEE_KNOWN_HOSTS -u SSH_AUTH_SOCK \
    PATH="$TMP/bin:$ORIGINAL_PATH" "$@"
}

run_deploy() {
  TRACE_RUN=default clean_env_prefix DEPLOY_CONFIG="$TMP/config.env" bash "$SCRIPT" reconcile
}
run_cmd() {
  TRACE_RUN=default clean_env_prefix DEPLOY_CONFIG="$TMP/config.env" bash "$SCRIPT" "$@"
}
run_manual_deploy() {
  TRACE_RUN=manual clean_env_prefix DEPLOY_CONFIG="$TMP/manual.env" bash "$SCRIPT" reconcile
}
run_systemd_deploy() {
  env -i PATH="$TMP/bin:$ORIGINAL_PATH" HOME="$TMP/systemd-home" TRACE_RUN=systemd \
    DEPLOY_CONFIG="$TMP/systemd.env" bash "$SCRIPT" reconcile
}
current_target() { readlink "$TMP/host/current"; }
previous_target() { [[ -L "$TMP/host/previous" ]] && readlink "$TMP/host/previous" || true; }
snapshot() {
  printf '%s\n' "$(current_target 2>/dev/null || true)" "$(previous_target)" \
    "$(cat "$TMP/host/state/current.sha" 2>/dev/null || true)" \
    "$(cat "$TMP/host/state/previous.sha" 2>/dev/null || true)" \
    "$(test -e "$TMP/host/state/transaction" && echo tx || true)"
}

sha1="$(commit_fixture one initial)"

expected_ssh_command="$SSH_BIN -F $GITEE_SSH_CONFIG -i $GITEE_SSH_KEY -o BatchMode=yes -o StrictHostKeyChecking=yes -o IdentitiesOnly=yes -o UserKnownHostsFile=$GITEE_KNOWN_HOSTS -o GlobalKnownHostsFile=/dev/null -o IdentityAgent=none -o ControlMaster=no -o ControlPath=none"
ssh_g_output="$TMP/ssh-g.output"
"$SSH_BIN" -G -F "$GITEE_SSH_CONFIG" \
  -i "$GITEE_SSH_KEY" \
  -o BatchMode=yes -o StrictHostKeyChecking=yes -o IdentitiesOnly=yes \
  -o UserKnownHostsFile="$GITEE_KNOWN_HOSTS" \
  -o GlobalKnownHostsFile=/dev/null -o IdentityAgent=none \
  -o ControlMaster=no -o ControlPath=none "$GITEE_SSH_HOST" >"$ssh_g_output" 2>/dev/null \
  || fail 'OpenSSH rejected the synthetic Gitee configuration'
grep -Fxq 'batchmode yes' "$ssh_g_output" || fail 'ssh -G missing BatchMode=yes'
grep -Fxq 'identitiesonly yes' "$ssh_g_output" || fail 'ssh -G missing IdentitiesOnly=yes'
grep -Fxq 'stricthostkeychecking true' "$ssh_g_output" || fail 'ssh -G missing StrictHostKeyChecking=yes'
grep -Fxq "userknownhostsfile $GITEE_KNOWN_HOSTS" "$ssh_g_output" || fail 'ssh -G missing pinned known_hosts'
grep -Fxq 'globalknownhostsfile /dev/null' "$ssh_g_output" || fail 'ssh -G did not disable global known_hosts'
grep -Fxq "identityfile $GITEE_SSH_KEY" "$ssh_g_output" || fail 'ssh -G missing configured identity'
grep -Fxq 'identityagent none' "$ssh_g_output" || fail 'ssh -G did not disable agent use'
grep -Fxq 'controlmaster false' "$ssh_g_output" || fail 'ssh -G did not disable ControlMaster'

assert_git_trace() {
  local run_id="$1" log_file
  log_file="$TRACE_DIR/$run_id.log"
  [[ -s "$log_file" ]] || fail "$run_id git trace is empty"
  grep -Fxq 'operation=ls-remote' "$log_file" || fail "$run_id did not perform ls-remote"
  grep -Fqx "GIT_SSH_COMMAND=$expected_ssh_command" "$log_file" \
    || fail "$run_id git child did not receive the expected SSH command"
}

expect_fail env -u GITEE_SSH_CONFIG -u GITEE_SSH_KEY -u GITEE_KNOWN_HOSTS \
  GIT_SSH_COMMAND='ssh -o StrictHostKeyChecking=no' PATH="$TMP/bin:$ORIGINAL_PATH" \
  DEPLOY_CONFIG="$TMP/config.env" bash "$SCRIPT" reconcile \
  || fail 'inherited GIT_SSH_COMMAND was not rejected'
pass 'inherited GIT_SSH_COMMAND rejected'

TRACE_RUN=manual env -u GIT_SSH_COMMAND -u GITEE_SSH_CONFIG -u GITEE_SSH_KEY -u GITEE_KNOWN_HOSTS \
  PATH="$TMP/bin:$ORIGINAL_PATH" SSH_AUTH_SOCK="$TMP/fake-agent.sock" \
  DEPLOY_CONFIG="$TMP/manual.env" bash "$SCRIPT" reconcile
run_systemd_deploy
assert_git_trace manual
assert_git_trace systemd
grep -Fq "$sha1" "$TRACE_DIR/manual.log" || fail 'manual fetch did not include exact target SHA'
grep -Fxq "SSH_AUTH_SOCK=$TMP/fake-agent.sock" "$TRACE_DIR/manual.log" \
  || fail 'manual git child did not receive the inherited agent marker'
grep -Fxq 'SSH_AUTH_SOCK=' "$TRACE_DIR/systemd.log" \
  || fail 'systemd git child inherited an agent marker'
[[ ! -s "$TMP/leaks" ]] || fail 'fake Bun observed deployment credential leakage'
pass 'SSH transport reaches ls-remote/fetch and stays out of env-i build'

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
env -u GIT_SSH_COMMAND -u GITEE_SSH_CONFIG -u GITEE_SSH_KEY -u GITEE_KNOWN_HOSTS \
  PATH="$TMP/bin:$ORIGINAL_PATH" TRACE_RUN=crash DEPLOY_TEST_FAIL_PHASE=after-current \
  DEPLOY_CONFIG="$TMP/config.env" bash "$SCRIPT" reconcile >/dev/null 2>&1 || true
[[ -e "$TMP/host/state/transaction" ]] || fail 'crash phase did not leave transaction intent'
run_deploy
[[ ! -e "$TMP/host/state/transaction" && "$(current_target)" == "$TMP/host/releases/$sha_recovery" ]] || fail 'transaction recovery failed'
pass 'transaction recovery repairs interrupted current switch'

python3 - "$TMP/config.env" "$TMP/subpath.env" <<'PY'
from pathlib import Path
import sys

source, target = map(Path, sys.argv[1:])
target.write_text(source.read_text().replace("VITE_BASE_PATH=/\n", "VITE_BASE_PATH=/computing-lab/\n"))
PY
before_snapshot="$(snapshot)"
expect_fail env -u GITEE_SSH_CONFIG -u GITEE_SSH_KEY -u GITEE_KNOWN_HOSTS \
  PATH="$TMP/bin:$ORIGINAL_PATH" DEPLOY_CONFIG="$TMP/subpath.env" bash "$SCRIPT" reconcile \
  || fail 'subpath production base was accepted'
[[ "$(snapshot)" == "$before_snapshot" ]] || fail 'subpath rejection mutated production state'
pass 'production reconciler rejects subpath artifact without mutation'

root_dist="$TMP/root-dist"
subpath_dist="$TMP/subpath-dist"
mkdir -p "$root_dist/assets" "$subpath_dist/assets"
printf '<div id="root"></div><script src="/assets/app.js"></script>\n' >"$root_dist/index.html"
printf 'root\n' >"$root_dist/assets/app.js"
printf '<div id="root"></div><script src="/computing-lab/assets/app.js"></script>\n' >"$subpath_dist/index.html"
printf 'subpath\n' >"$subpath_dist/assets/app.js"
"$REAL_BUN" "$ROOT/deploy/smoke.mjs" "$root_dist" / >/dev/null
"$REAL_BUN" "$ROOT/deploy/smoke.mjs" "$subpath_dist" /computing-lab/ >/dev/null
pass 'root and subpath artifact HTTP smoke matrices pass independently'

grep -Fq 'root * {$DEPLOY_ROOT}/current/dist' "$ROOT/deploy/Caddyfile.example" || fail 'Caddy production root missing'
if grep -Fq 'handle_path /computing-lab/' "$ROOT/deploy/Caddyfile.example" || grep -Fq 'redir /computing-lab' "$ROOT/deploy/Caddyfile.example"; then
  fail 'Caddy production template still presents a subpath artifact'
fi
grep -Fq 'not path /assets/*' "$ROOT/deploy/Caddyfile.example" || fail 'Caddy asset exclusion missing'
grep -Fq 'rewrite @spa /index.html' "$ROOT/deploy/Caddyfile.example" || fail 'Caddy SPA fallback missing'
pass 'Caddy production contract plus local HTTP fallback smoke'

symlink_root="$TMP/symlink-host"
mkdir -p "$symlink_root" "$TMP/outside"
ln -s "$TMP/outside" "$symlink_root/releases"
python3 - "$TMP/config.env" "$TMP/symlink-config.env" "$symlink_root" <<'PY'
from pathlib import Path
import sys

source, target, root = map(Path, sys.argv[1:])
lines = [f"DEPLOY_ROOT={root}" if line.startswith("DEPLOY_ROOT=") else line for line in source.read_text().splitlines()]
target.write_text("\n".join(lines) + "\n")
PY
symlink_error="$(env DEPLOY_CONFIG="$TMP/symlink-config.env" bash "$SCRIPT" status 2>&1 || true)"
grep -Fq 'deployment child is unsafe' <<<"$symlink_error" \
  || fail 'symlinked deployment child did not reach the child safety check'
pass 'deployment child symlink rejected'

lock_root="$TMP/lock-host"
mkdir -p "$lock_root/state"
ln -s "$TMP/outside" "$lock_root/state/deploy.lock"
python3 - "$TMP/config.env" "$TMP/lock-config.env" "$lock_root" <<'PY'
from pathlib import Path
import sys

source, target, root = map(Path, sys.argv[1:])
lines = [f"DEPLOY_ROOT={root}" if line.startswith("DEPLOY_ROOT=") else line for line in source.read_text().splitlines()]
target.write_text("\n".join(lines) + "\n")
PY
lock_error="$(env DEPLOY_CONFIG="$TMP/lock-config.env" bash "$SCRIPT" status 2>&1 || true)"
grep -Fq 'deployment lock path is unsafe' <<<"$lock_error" \
  || fail 'symlinked deployment lock did not reach the lock safety check'
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
