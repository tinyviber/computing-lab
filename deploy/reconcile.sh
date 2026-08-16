#!/usr/bin/env bash
set -Eeuo pipefail

# Computing Lab host-side static reconciler.
# This script is intentionally Bash-only and has no application runtime.
umask 027

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_CONFIG="${DEPLOY_CONFIG:-/etc/computing-lab/deploy.env}"
if [[ -f "$DEPLOY_CONFIG" ]]; then
  # shellcheck disable=SC1090
  source "$DEPLOY_CONFIG"
fi

DEPLOY_ROOT="${DEPLOY_ROOT:-/srv/computing-lab}"
GITEE_REMOTE="${GITEE_REMOTE:-}"
GITEE_REF="${GITEE_REF:-main}"
BUN_BIN="${BUN_BIN:-}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
FLOCK_BIN="${FLOCK_BIN:-flock}"
KEEP_RELEASES="${KEEP_RELEASES:-3}"
VITE_BASE_PATH="${VITE_BASE_PATH:-/}"

SOURCE_REPO="$DEPLOY_ROOT/source.git"
RELEASES_DIR="$DEPLOY_ROOT/releases"
STATE_DIR="$DEPLOY_ROOT/state"
WORK_DIR="$DEPLOY_ROOT/work"
QUARANTINE_DIR="$DEPLOY_ROOT/quarantine"
CURRENT_LINK="$DEPLOY_ROOT/current"
PREVIOUS_LINK="$DEPLOY_ROOT/previous"
LOCK_FILE="$STATE_DIR/deploy.lock"
TX_FILE="$STATE_DIR/transaction"
HOLD_FILE="$STATE_DIR/hold"
CURRENT_MARKER="$STATE_DIR/current.sha"
PREVIOUS_MARKER="$STATE_DIR/previous.sha"

LOCK_FD=''
LOCK_HELD=0
STAGING_DIR=''
RELEASE_CREATED=''
TARGET_SHA=''

log() { printf 'computing-lab-deploy: %s\n' "$*"; }
die() { printf 'computing-lab-deploy: %s\n' "$*" >&2; exit 1; }

is_sha() { [[ "$1" =~ ^[0-9a-f]{40}$ ]]; }

validate_base() {
  local value="$1"
  [[ "$value" == "/" || "$value" =~ ^/[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*/?$ ]] \
    || die "VITE_BASE_PATH is unsafe: $value"
}

validate_config() {
  [[ "$DEPLOY_ROOT" == /* && "$DEPLOY_ROOT" != "/" && "$DEPLOY_ROOT" != */..* ]] \
    || die 'DEPLOY_ROOT must be an absolute non-root path'
  [[ "$GITEE_REF" == main ]] || die 'GITEE_REF must be main for production reconciliation'
  git check-ref-format --branch "$GITEE_REF" >/dev/null \
    || die 'GITEE_REF failed git check-ref-format'
  [[ -n "$GITEE_REMOTE" ]] || die 'GITEE_REMOTE is required'
  [[ -n "$BUN_BIN" && "$BUN_BIN" == /* && -x "$BUN_BIN" && ! -L "$BUN_BIN" ]] \
    || die 'BUN_BIN must be an absolute, executable, non-symlink path'
  [[ "$KEEP_RELEASES" =~ ^[1-9][0-9]*$ ]] || die 'KEEP_RELEASES must be positive'
  validate_base "$VITE_BASE_PATH"
  command -v "$PYTHON_BIN" >/dev/null || die 'PYTHON_BIN is unavailable'
  command -v "$FLOCK_BIN" >/dev/null || die 'flock is required on deployment host'
}

ensure_root_safety() {
  [[ -e "$DEPLOY_ROOT" && ! -L "$DEPLOY_ROOT" && -d "$DEPLOY_ROOT" ]] \
    || die 'DEPLOY_ROOT must already exist as a non-symlink directory; bootstrap it first'
  [[ -w "$DEPLOY_ROOT" ]] || die 'DEPLOY_ROOT is not writable by deployment identity'
}

sha256_stdin() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum | awk '{print $1}'
  else
    shasum -a 256 | awk '{print $1}'
  fi
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

fsync_path() {
  "$PYTHON_BIN" "$SCRIPT_DIR/fsync.py" "$@"
}

atomic_write() {
  local path="$1" value="$2" dir tmp
  dir="$(dirname "$path")"
  tmp="$dir/.$(basename "$path").tmp.$$"
  printf '%s\n' "$value" >"$tmp"
  fsync_path "$tmp"
  mv -f "$tmp" "$path"
  fsync_path "$dir"
}

atomic_link() {
  "$PYTHON_BIN" "$SCRIPT_DIR/fsync.py" --replace-symlink "$1" "$2"
}

remove_link() {
  local link="$1" dir
  dir="$(dirname "$link")"
  rm -f "$link"
  fsync_path "$dir"
}

remove_file() {
  local path="$1" dir
  dir="$(dirname "$path")"
  rm -f "$path"
  fsync_path "$dir"
}

init_layout() {
  ensure_root_safety
  local directory
  for directory in "$RELEASES_DIR" "$STATE_DIR" "$WORK_DIR" "$QUARANTINE_DIR"; do
    if [[ -L "$directory" || ( -e "$directory" && ! -d "$directory" ) ]]; then
      die "deployment child is unsafe: $directory"
    fi
    [[ -e "$directory" ]] || mkdir "$directory"
    chmod 0750 "$directory"
  done
  fsync_path "$DEPLOY_ROOT"
}

release_lock() {
  if [[ "$LOCK_HELD" == 1 ]]; then
    "$FLOCK_BIN" -u "$LOCK_FD" >/dev/null 2>&1 || true
    eval "exec ${LOCK_FD}>&-" || true
    LOCK_HELD=0
  fi
}

validate_lock_path() {
  [[ ! -L "$LOCK_FILE" && ( ! -e "$LOCK_FILE" || -f "$LOCK_FILE" ) ]] \
    || die 'deployment lock path is unsafe'
}

on_exit() {
  local status=$?
  if [[ -n "$STAGING_DIR" && -d "$STAGING_DIR" ]]; then
    rm -rf "$STAGING_DIR"
  fi
  release_lock
  exit "$status"
}

acquire_lock() {
  validate_lock_path
  eval "exec {LOCK_FD}>>\"$LOCK_FILE\""
  chmod 0640 "$LOCK_FILE"
  if ! "$FLOCK_BIN" -n "$LOCK_FD"; then
    eval "exec ${LOCK_FD}>&-"
    die 'another deployment operation is running'
  fi
  LOCK_HELD=1
  trap on_exit EXIT
}

read_link_sha() {
  local link="$1" target sha
  [[ ! -e "$link" && ! -L "$link" ]] && return 0
  [[ -L "$link" ]] || die "$link exists but is not a symlink"
  target="$(readlink "$link")"
  [[ "$target" == "$RELEASES_DIR/"* ]] || die "$link points outside releases"
  sha="${target##*/}"
  is_sha "$sha" || die "$link points to invalid release"
  [[ "$target" == "$RELEASES_DIR/$sha" ]] || die "$link target is not canonical"
  printf '%s' "$sha"
}

read_marker() {
  local path="$1" value=''
  [[ -f "$path" && ! -L "$path" ]] || return 0
  value="$(<"$path")"
  is_sha "$value" && printf '%s' "$value"
}

validate_markers() {
  local current previous current_marker previous_marker
  current="$(read_link_sha "$CURRENT_LINK")"
  previous="$(read_link_sha "$PREVIOUS_LINK")"
  current_marker="$(read_marker "$CURRENT_MARKER")"
  previous_marker="$(read_marker "$PREVIOUS_MARKER")"
  if [[ -n "$current" ]]; then
    [[ "$current_marker" == "$current" ]] || die 'current marker disagrees with current symlink'
  else
    [[ ! -e "$CURRENT_MARKER" && ! -L "$CURRENT_MARKER" ]] || die 'orphan current marker'
  fi
  if [[ -n "$previous" ]]; then
    [[ "$previous_marker" == "$previous" ]] || die 'previous marker disagrees with previous symlink'
  else
    [[ ! -e "$PREVIOUS_MARKER" && ! -L "$PREVIOUS_MARKER" ]] || die 'orphan previous marker'
  fi
}

validate_active_releases() {
  local current previous
  current="$(read_link_sha "$CURRENT_LINK")"
  previous="$(read_link_sha "$PREVIOUS_LINK")"
  if [[ -n "$current" ]]; then
    validate_release "$current" || die 'current release is invalid'
  fi
  if [[ -n "$previous" ]]; then
    validate_release "$previous" || die 'previous release is invalid'
  fi
}

meta_value() {
  local file="$1" key="$2" value count
  count=0
  while IFS= read -r line; do
    [[ "$line" == "$key="* ]] || continue
    value="${line#*=}"
    count=$((count + 1))
  done <"$file"
  [[ "$count" == 1 ]] || return 1
  printf '%s' "$value"
}

dist_manifest_digest() {
  local dist="$1" file relative
  while IFS= read -r -d '' file; do
    relative="${file#"$dist"/}"
    printf '%s  %s\n' "$(sha256_file "$file")" "$relative"
  done < <(find "$dist" -type f -print0 | LC_ALL=C sort -z) | sha256_stdin
}

validate_static_tree() {
  local dist="$1"
  "$PYTHON_BIN" - "$dist" <<'PY'
import os
import stat
import sys

root = os.path.abspath(sys.argv[1])
if not os.path.isdir(root) or os.path.islink(root):
    raise SystemExit("dist must be a real directory")
for current, dirs, files in os.walk(root, followlinks=False):
    for name in dirs + files:
        path = os.path.join(current, name)
        relative = os.path.relpath(path, root)
        if relative.startswith("..") or os.path.isabs(relative):
            raise SystemExit("dist path escapes root")
        info = os.lstat(path)
        if stat.S_ISLNK(info.st_mode):
            raise SystemExit("dist contains symlink: " + relative)
        if not (stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode)):
            raise SystemExit("dist contains special file: " + relative)
        if stat.S_ISREG(info.st_mode) and info.st_nlink > 1:
            raise SystemExit("dist contains hard-linked file: " + relative)
PY
  [[ -f "$dist/index.html" ]] || die 'dist/index.html is missing'
  find "$dist" -type f ! -name index.html -print -quit | grep -q . \
    || die 'dist has no static asset besides index.html'
}

validate_release() {
  local sha="$1" release meta dist expected
  release="$RELEASES_DIR/$sha"
  is_sha "$sha" || return 1
  [[ -d "$release" && ! -L "$release" ]] || return 1
  meta="$release/release.env"
  dist="$release/dist"
  [[ -f "$meta" && ! -L "$meta" && -d "$dist" && ! -L "$dist" ]] || return 1
  "$PYTHON_BIN" - "$meta" "$sha" "$VITE_BASE_PATH" <<'PY' || return 1
import sys

path, expected_sha, expected_base = sys.argv[1:]
expected = {
    "SOURCE_SHA": expected_sha,
    "GITEE_REF": "main",
    "VITE_BASE_PATH": expected_base,
    "BUN_VERSION": "1.2.17",
    "SMOKE": "pass",
}
values = {}
with open(path, encoding="utf-8") as handle:
    lines = [line.rstrip("\n") for line in handle]
if len(lines) != 7:
    raise SystemExit(1)
for line in lines:
    key, separator, value = line.partition("=")
    if not separator or key in values or key not in set(expected) | {"LOCKFILE_SHA256", "DIST_MANIFEST_SHA256"}:
        raise SystemExit(1)
    values[key] = value
for key, value in expected.items():
    if values.get(key) != value:
        raise SystemExit(1)
PY
  expected="$(meta_value "$meta" LOCKFILE_SHA256)"; [[ "$expected" =~ ^[0-9a-f]{64}$ ]] || return 1
  expected="$(meta_value "$meta" DIST_MANIFEST_SHA256)"; [[ "$expected" =~ ^[0-9a-f]{64}$ ]] || return 1
  validate_static_tree "$dist" >/dev/null 2>&1 || return 1
  [[ "$(dist_manifest_digest "$dist")" == "$(meta_value "$meta" DIST_MANIFEST_SHA256)" ]] || return 1
  [[ -d "$SOURCE_REPO/objects" ]] || return 1
  git --git-dir="$SOURCE_REPO" cat-file -e "$sha^{commit}" 2>/dev/null || return 1
  [[ "$(git --git-dir="$SOURCE_REPO" show "$sha:bun.lock" | sha256_stdin)" == "$(meta_value "$meta" LOCKFILE_SHA256)" ]] || return 1
}

protected_release() {
  local sha="$1" current previous
  current="$(read_link_sha "$CURRENT_LINK")"
  previous="$(read_link_sha "$PREVIOUS_LINK")"
  [[ "$sha" == "$current" || "$sha" == "$previous" ]]
}

quarantine_release() {
  local sha="$1" release="$RELEASES_DIR/$sha" destination
  [[ -e "$release" ]] || return 0
  protected_release "$sha" && die "protected release $sha is invalid"
  destination="$QUARANTINE_DIR/${sha}.$$.${RANDOM}"
  mv "$release" "$destination"
  fsync_path "$QUARANTINE_DIR" "$RELEASES_DIR"
  log "quarantined invalid release $sha"
}

write_transaction() {
  local op="$1" phase="$2" old_current="$3" old_previous="$4" new_current="$5" new_previous="$6"
  local value
  value=$(printf 'OP=%s\nPHASE=%s\nOLD_CURRENT=%s\nOLD_PREVIOUS=%s\nNEW_CURRENT=%s\nNEW_PREVIOUS=%s' \
    "$op" "$phase" "$old_current" "$old_previous" "$new_current" "$new_previous")
  atomic_write "$TX_FILE" "$value"
}

tx_value() { meta_value "$TX_FILE" "$1"; }

clear_transaction() {
  [[ -e "$TX_FILE" ]] || return 0
  rm -f "$TX_FILE"
  fsync_path "$STATE_DIR"
}

recover_transaction() {
  [[ -e "$TX_FILE" ]] || return 0
  [[ -f "$TX_FILE" ]] || die 'deployment transaction is not a regular file'
  local old_current old_previous new_current new_previous current previous
  old_current="$(tx_value OLD_CURRENT)" || die 'transaction is malformed'
  old_previous="$(tx_value OLD_PREVIOUS)" || die 'transaction is malformed'
  new_current="$(tx_value NEW_CURRENT)" || die 'transaction is malformed'
  new_previous="$(tx_value NEW_PREVIOUS)" || die 'transaction is malformed'
  [[ -z "$old_current" || $(is_sha "$old_current"; echo $?) == 0 ]] || die 'transaction old current invalid'
  [[ -z "$old_previous" || $(is_sha "$old_previous"; echo $?) == 0 ]] || die 'transaction old previous invalid'
  is_sha "$new_current" || die 'transaction new current invalid'
  [[ -z "$new_previous" || $(is_sha "$new_previous"; echo $?) == 0 ]] || die 'transaction new previous invalid'
  if [[ -n "$old_current" ]]; then
    validate_release "$old_current" || die 'transaction old current release invalid'
  fi
  if [[ -n "$old_previous" ]]; then
    validate_release "$old_previous" || die 'transaction old previous release invalid'
  fi
  validate_release "$new_current" || die 'transaction new current release invalid'
  if [[ -n "$new_previous" ]]; then
    validate_release "$new_previous" || die 'transaction new previous release invalid'
  fi
  current="$(read_link_sha "$CURRENT_LINK")"
  previous="$(read_link_sha "$PREVIOUS_LINK")"
  if [[ "$current" == "$new_current" ]]; then
    if [[ -n "$new_previous" ]]; then atomic_link "$RELEASES_DIR/$new_previous" "$PREVIOUS_LINK"; else remove_link "$PREVIOUS_LINK"; fi
    atomic_write "$CURRENT_MARKER" "$new_current"
    if [[ -n "$new_previous" ]]; then atomic_write "$PREVIOUS_MARKER" "$new_previous"; else remove_file "$PREVIOUS_MARKER"; fi
    clear_transaction
    log 'recovered completed current switch'
  elif [[ "$current" == "$old_current" ]]; then
    if [[ -n "$old_previous" ]]; then atomic_link "$RELEASES_DIR/$old_previous" "$PREVIOUS_LINK"; else remove_link "$PREVIOUS_LINK"; fi
    if [[ -n "$old_current" ]]; then atomic_write "$CURRENT_MARKER" "$old_current"; else remove_file "$CURRENT_MARKER"; fi
    if [[ -n "$old_previous" ]]; then atomic_write "$PREVIOUS_MARKER" "$old_previous"; else remove_file "$PREVIOUS_MARKER"; fi
    clear_transaction
    log 'discarded incomplete switch and restored old pointers'
  else
    die 'transaction and current pointer disagree; manual recovery required'
  fi
  [[ "$previous" == "$new_previous" || "$previous" == "$old_previous" || -z "$previous" ]] || true
}

test_fail_phase() {
  [[ -n "${DEPLOY_TEST_FAIL_PHASE:-}" && "${DEPLOY_TEST_FAIL_PHASE}" == "$1" ]] || return 0
  kill -KILL "$$"
}

read_remote_sha() {
  local output line sha ref extra
  output="$(git ls-remote --exit-code "$GITEE_REMOTE" "refs/heads/main")" \
    || die 'Gitee main ref cannot be read'
  local lines=()
  while IFS= read -r line; do [[ -n "$line" ]] && lines+=("$line"); done <<<"$output"
  [[ "${#lines[@]}" == 1 ]] || die 'Gitee main ref returned unexpected output'
  read -r sha ref extra <<<"${lines[0]}"
  is_sha "$sha" || die 'Gitee main did not return a full lowercase SHA'
  [[ "$ref" == refs/heads/main ]] || die 'Gitee returned an unexpected ref'
  [[ -z "$extra" ]] || die 'Gitee main returned extra fields'
  printf '%s' "$sha"
}

ensure_source_repo() {
  if [[ -L "$SOURCE_REPO" || ( -e "$SOURCE_REPO" && ! -d "$SOURCE_REPO" ) ]]; then
    die 'source cache is unsafe'
  fi
  if [[ ! -e "$SOURCE_REPO" ]]; then
    git init --bare "$SOURCE_REPO" >/dev/null
  fi
  [[ ! -L "$SOURCE_REPO" && -d "$SOURCE_REPO/objects" ]] || die 'source cache is unsafe'
  if git --git-dir="$SOURCE_REPO" remote get-url origin >/dev/null 2>&1; then
    git --git-dir="$SOURCE_REPO" remote set-url origin "$GITEE_REMOTE"
  else
    git --git-dir="$SOURCE_REPO" remote add origin "$GITEE_REMOTE"
  fi
}

build_candidate() {
  local sha="$1" source build_home lock_digest manifest
  STAGING_DIR="$WORK_DIR/$sha.$$"
  source="$STAGING_DIR/source"
  build_home="$STAGING_DIR/home"
  mkdir -p "$source" "$build_home"
  git --git-dir="$SOURCE_REPO" archive "$sha" | tar -x -C "$source"
  [[ -f "$source/package.json" && -f "$source/bun.lock" ]] || die 'exact source lacks package manifests'
  lock_digest="$(sha256_file "$source/bun.lock")"
  log "installing frozen dependencies for $sha"
  (cd "$source" && env -i PATH="${PATH:-/usr/bin:/bin}" HOME="$build_home" \
    VITE_BASE_PATH="$VITE_BASE_PATH" NODE_ENV=production \
    "$BUN_BIN" install --frozen-lockfile)
  log "building static dist for $sha"
  (cd "$source" && env -i PATH="${PATH:-/usr/bin:/bin}" HOME="$build_home" \
    VITE_BASE_PATH="$VITE_BASE_PATH" NODE_ENV=production \
    "$BUN_BIN" run build)
  validate_static_tree "$source/dist"
  log "smoking staged dist for $sha"
  (cd "$source" && env -i PATH="${PATH:-/usr/bin:/bin}" HOME="$build_home" \
    VITE_BASE_PATH="$VITE_BASE_PATH" \
    "$BUN_BIN" "$source/deploy/smoke.mjs" "$source/dist" "$VITE_BASE_PATH")
  validate_static_tree "$source/dist"
  mkdir -p "$STAGING_DIR/release"
  cp -a "$source/dist" "$STAGING_DIR/release/dist"
  validate_static_tree "$STAGING_DIR/release/dist"
  manifest="$(dist_manifest_digest "$STAGING_DIR/release/dist")"
  cat >"$STAGING_DIR/release/release.env" <<EOF
SOURCE_SHA=$sha
GITEE_REF=main
VITE_BASE_PATH=$VITE_BASE_PATH
BUN_VERSION=1.2.17
LOCKFILE_SHA256=$lock_digest
DIST_MANIFEST_SHA256=$manifest
SMOKE=pass
EOF
  fsync_path "$STAGING_DIR/release/release.env" "$STAGING_DIR/release/dist" "$STAGING_DIR/release"
}

publish_candidate() {
  local sha="$1" old_current old_previous release="$RELEASES_DIR/$1" candidate="$STAGING_DIR/release"
  old_current="$(read_link_sha "$CURRENT_LINK")"
  old_previous="$(read_link_sha "$PREVIOUS_LINK")"
  if [[ -e "$release" ]]; then
    if ! validate_release "$sha"; then
      quarantine_release "$sha"
    else
      rm -rf "$candidate"
    fi
  fi
  if [[ ! -e "$release" ]]; then
    mv "$candidate" "$release"
    fsync_path "$RELEASES_DIR"
    RELEASE_CREATED=1
  fi
  validate_release "$sha" || die 'candidate release failed strict validation'
  [[ "$(read_remote_sha)" == "$sha" ]] || die 'Gitee main moved before pointer transaction'
  write_transaction publish prepared "$old_current" "$old_previous" "$sha" "$old_current"
  atomic_link "$RELEASES_DIR/$sha" "$CURRENT_LINK"
  test_fail_phase after-current
  write_transaction publish current-switched "$old_current" "$old_previous" "$sha" "$old_current"
  if [[ -n "$old_current" ]]; then atomic_link "$RELEASES_DIR/$old_current" "$PREVIOUS_LINK"; else remove_link "$PREVIOUS_LINK"; fi
  test_fail_phase after-previous
  write_transaction publish previous-switched "$old_current" "$old_previous" "$sha" "$old_current"
  atomic_write "$CURRENT_MARKER" "$sha"
  if [[ -n "$old_current" ]]; then atomic_write "$PREVIOUS_MARKER" "$old_current"; else remove_file "$PREVIOUS_MARKER"; fi
  test_fail_phase after-markers
  clear_transaction
  log "published $sha"
}

cleanup_releases() {
  local current previous path sha kept=0
  current="$(read_link_sha "$CURRENT_LINK")"
  previous="$(read_link_sha "$PREVIOUS_LINK")"
  for path in "$RELEASES_DIR"/*; do
    [[ -d "$path" && ! -L "$path" ]] || continue
    sha="${path##*/}"
    is_sha "$sha" || continue
    [[ "$sha" == "$current" || "$sha" == "$previous" ]] && continue
    if ! validate_release "$sha"; then
      quarantine_release "$sha"
      continue
    fi
    kept=$((kept + 1))
    if (( kept > KEEP_RELEASES )); then
      rm -rf "$path"
      fsync_path "$RELEASES_DIR"
      log "removed old release $sha"
    fi
  done
}

reconcile() {
  validate_config
  "$BUN_BIN" --version | grep -Fxq '1.2.17' || die 'BUN_BIN version must be exactly 1.2.17'
  init_layout
  acquire_lock
  ensure_source_repo
  recover_transaction
  validate_active_releases
  validate_markers
  [[ -e "$HOLD_FILE" ]] && { log 'hold is active; reconcile is a strict no-op'; return 0; }
  TARGET_SHA="$(read_remote_sha)"
  local current
  current="$(read_link_sha "$CURRENT_LINK")"
  if [[ "$current" == "$TARGET_SHA" ]]; then
    validate_release "$TARGET_SHA" || die 'current release metadata is incomplete or tampered'
    log "target $TARGET_SHA already current; strict no-op"
    return 0
  fi
  log "fetching exact target $TARGET_SHA"
  git --git-dir="$SOURCE_REPO" fetch --no-tags --prune origin "$TARGET_SHA" >/dev/null
  git --git-dir="$SOURCE_REPO" cat-file -e "$TARGET_SHA^{commit}" \
    || die 'fetched target is not a commit'
  [[ "$(read_remote_sha)" == "$TARGET_SHA" ]] || die 'Gitee main moved before build'
  build_candidate "$TARGET_SHA"
  [[ "$(read_remote_sha)" == "$TARGET_SHA" ]] || die 'Gitee main moved during build; stale release refused'
  publish_candidate "$TARGET_SHA"
  rm -rf "$STAGING_DIR"
  STAGING_DIR=''
  cleanup_releases
}

rollback() {
  validate_config
  init_layout
  acquire_lock
  ensure_source_repo
  recover_transaction
  validate_active_releases
  validate_markers
  local current previous
  current="$(read_link_sha "$CURRENT_LINK")"
  previous="$(read_link_sha "$PREVIOUS_LINK")"
  [[ -n "$current" && -n "$previous" ]] || die 'rollback requires current and previous releases'
  validate_release "$current" || die 'current release is invalid'
  validate_release "$previous" || die 'previous release is invalid'
  atomic_write "$HOLD_FILE" "rollback $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  write_transaction rollback prepared "$current" "$previous" "$previous" "$current"
  atomic_link "$RELEASES_DIR/$previous" "$CURRENT_LINK"
  test_fail_phase after-current
  write_transaction rollback current-switched "$current" "$previous" "$previous" "$current"
  atomic_link "$RELEASES_DIR/$current" "$PREVIOUS_LINK"
  test_fail_phase after-previous
  write_transaction rollback previous-switched "$current" "$previous" "$previous" "$current"
  atomic_write "$CURRENT_MARKER" "$previous"
  atomic_write "$PREVIOUS_MARKER" "$current"
  test_fail_phase after-markers
  clear_transaction
  log "rolled back to $previous; hold remains active"
}

status_command() {
  validate_config
  init_layout
  local current previous marker hold
  current="$(read_link_sha "$CURRENT_LINK")"
  previous="$(read_link_sha "$PREVIOUS_LINK")"
  marker="$(read_marker "$CURRENT_MARKER")"
  hold='no'; [[ -e "$HOLD_FILE" ]] && hold='yes'
  printf 'current=%s\nprevious=%s\nhold=%s\nmarker=%s\ntransaction=%s\n' \
    "${current:-none}" "${previous:-none}" "$hold" "${marker:-none}" "$( [[ -e "$TX_FILE" ]] && echo present || echo none )"
  validate_lock_path
  exec {LOCK_FD}>>"$LOCK_FILE"
  if "$FLOCK_BIN" -n "$LOCK_FD"; then
    printf 'lock=free\n'
    "$FLOCK_BIN" -u "$LOCK_FD" || true
  else
    printf 'lock=busy\n'
  fi
  exec {LOCK_FD}>&-
}

hold_command() { validate_config; init_layout; acquire_lock; ensure_source_repo; recover_transaction; validate_active_releases; validate_markers; atomic_write "$HOLD_FILE" "manual hold $(date -u +%Y-%m-%dT%H:%M:%SZ)"; log 'hold enabled'; }
resume_command() { validate_config; init_layout; acquire_lock; ensure_source_repo; recover_transaction; validate_active_releases; validate_markers; remove_file "$HOLD_FILE"; log 'hold cleared; run reconcile to deploy'; }
cleanup_command() { validate_config; init_layout; acquire_lock; ensure_source_repo; recover_transaction; validate_active_releases; validate_markers; cleanup_releases; }

command="${1:-}"
case "$command" in
  reconcile) reconcile ;;
  rollback) rollback ;;
  status) status_command ;;
  hold) hold_command ;;
  resume) resume_command ;;
  cleanup) cleanup_command ;;
  *) die 'usage: reconcile.sh {reconcile|status|rollback|hold|resume|cleanup}' ;;
esac
