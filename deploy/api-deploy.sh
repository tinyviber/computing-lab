#!/usr/bin/env bash
set -Eeuo pipefail

# Computing Lab host-side API deployer.
# Owns the Node (Hono + node:sqlite) service at $API_ROOT/source.
# Static dist/ deployment is handled by reconcile.sh; `deploy` triggers it
# once at the end unless --skip-static is given.
#
# Runs as root. All git/Bun work happens as $API_USER via runuser; the service
# account never needs a login shell or read access to api.env.
umask 027

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_CONFIG="${API_DEPLOY_CONFIG:-/etc/computing-lab/api-deploy.env}"
REQUESTED_TEST_MODE="${API_DEPLOY_TEST_MODE:-0}"
if [[ -f "$DEPLOY_CONFIG" ]]; then
  /usr/bin/python3 - "$DEPLOY_CONFIG" "$REQUESTED_TEST_MODE" <<'PY'
import os
import stat
import sys

path, test_mode = sys.argv[1:]
info = os.lstat(path)
parent = os.lstat(os.path.dirname(os.path.abspath(path)))
if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
    raise SystemExit("API_DEPLOY_CONFIG must be a regular non-symlink file")
if test_mode != "1" and info.st_uid != 0:
    raise SystemExit("API_DEPLOY_CONFIG must be root-owned")
if stat.S_IMODE(info.st_mode) & 0o022:
    raise SystemExit("API_DEPLOY_CONFIG has unsafe permissions")
if stat.S_ISLNK(parent.st_mode) or not stat.S_ISDIR(parent.st_mode):
    raise SystemExit("API_DEPLOY_CONFIG parent must be a real directory")
if test_mode != "1" and parent.st_uid != 0:
    raise SystemExit("API_DEPLOY_CONFIG parent must be root-owned")
if stat.S_IMODE(parent.st_mode) & 0o022:
    raise SystemExit("API_DEPLOY_CONFIG parent is unsafe")
PY
  # shellcheck disable=SC1090
  source "$DEPLOY_CONFIG"
fi
DEPLOY_TEST_MODE="$REQUESTED_TEST_MODE"

API_ROOT="${API_ROOT:-/srv/computing-lab-api}"
API_USER="${API_USER:-computing-lab-editor}"
API_GROUP="${API_GROUP:-computing-lab-editor}"
API_SERVICE="${API_SERVICE:-computing-lab-api.service}"
STATIC_SERVICE="${STATIC_SERVICE:-computing-lab-reconcile.service}"
GIT_REMOTE="${GIT_REMOTE:-origin}"
GIT_REF="${GIT_REF:-main}"
NODE_BIN="${NODE_BIN:-/opt/node22/bin/node}"
BUN_BIN="${BUN_BIN:-/usr/local/bin/bun}"
API_ENV_FILE="${API_ENV_FILE:-/etc/computing-lab/api.env}"
KEEP_DB_BACKUPS="${KEEP_DB_BACKUPS:-10}"
HEALTH_TIMEOUT_SEC="${HEALTH_TIMEOUT_SEC:-30}"

SOURCE_DIR="$API_ROOT/source"
STATE_DIR="$API_ROOT/state"
HOME_DIR="$API_ROOT/home"
LOCK_FILE="$STATE_DIR/api-deploy.lock"
PREVIOUS_SHA_FILE="$STATE_DIR/previous.sha"
DEPLOYED_SHA_FILE="$STATE_DIR/deployed.sha"

LOCK_FD=''
LOCK_HELD=0
DRY_RUN=0
DO_SEED=0
SKIP_STATIC=0
TARGET_SHA=''

log() { printf 'computing-lab-api-deploy: %s\n' "$*"; }
die() { printf 'computing-lab-api-deploy: %s\n' "$*" >&2; exit 1; }
run() { if [[ "$DRY_RUN" == 1 ]]; then log "dry-run: $*"; else "$@"; fi; }

is_sha() { [[ "$1" =~ ^[0-9a-f]{40}$ ]]; }

require_root() {
  [[ "$DEPLOY_TEST_MODE" == 1 ]] && return 0
  [[ "$(id -u)" == 0 ]] || die 'must run as root (sudo)'
}

validate_config() {
  [[ "$DEPLOY_TEST_MODE" == 0 || "$DEPLOY_TEST_MODE" == 1 ]] \
    || die 'API_DEPLOY_TEST_MODE must be 0 or 1'
  [[ "$API_ROOT" == /* && "$API_ROOT" != "/" && "$API_ROOT" != */..* ]] \
    || die 'API_ROOT must be an absolute non-root path'
  [[ "$API_USER" =~ ^[a-z_][a-z0-9_-]*$ && "$API_GROUP" =~ ^[a-z_][a-z0-9_-]*$ ]] \
    || die 'API_USER/API_GROUP are unsafe'
  [[ "$GIT_REF" == main ]] || die 'GIT_REF must be main'
  [[ "$NODE_BIN" == /* && -x "$NODE_BIN" && ! -L "$NODE_BIN" ]] \
    || die 'NODE_BIN must be an absolute, executable, non-symlink path'
  [[ "$API_ENV_FILE" == /* && -f "$API_ENV_FILE" && ! -L "$API_ENV_FILE" ]] \
    || die 'API_ENV_FILE must be an existing regular non-symlink file'
  [[ "$KEEP_DB_BACKUPS" =~ ^[0-9]+$ ]] || die 'KEEP_DB_BACKUPS must be numeric'
  [[ "$HEALTH_TIMEOUT_SEC" =~ ^[1-9][0-9]*$ ]] || die 'HEALTH_TIMEOUT_SEC must be positive'
  [[ -d "$SOURCE_DIR/.git" && ! -L "$SOURCE_DIR" ]] \
    || die 'API source checkout missing or unsafe'
  command -v git >/dev/null || die 'git not found'
  command -v curl >/dev/null || die 'curl not found'
  command -v flock >/dev/null || die 'flock not found'
  if [[ "$DEPLOY_TEST_MODE" != 1 ]]; then
    command -v runuser >/dev/null || die 'runuser not found'
    command -v systemctl >/dev/null || die 'systemctl not found'
    command -v systemd-run >/dev/null || die 'systemd-run not found'
    id "$API_USER" >/dev/null 2>&1 || die "service user missing: $API_USER"
  fi
}

# Read a KEY=value from api.env without sourcing it (it is root:root 0600 and
# must never be exposed to the service account or the process environment of
# untrusted children).
api_env_value() {
  local key="$1" line
  line="$(grep -m1 "^${key}=" "$API_ENV_FILE" 2>/dev/null)" || true
  line="${line#*=}"
  line="${line%\"}"; line="${line#\"}"
  line="${line%\'}"; line="${line#\'}"
  printf '%s' "$line"
}

api_port() { local v; v="$(api_env_value LAB_PORT)"; printf '%s' "${v:-8788}"; }

db_path() {
  local v; v="$(api_env_value LAB_DB_PATH)"
  [[ -z "$v" ]] && v="$API_ROOT/lab.db"
  [[ "$v" == /* ]] || v="$SOURCE_DIR/$v"
  printf '%s' "$v"
}

ensure_state() {
  run install -d -o "$API_USER" -g "$API_GROUP" -m 0750 "$STATE_DIR" "$HOME_DIR"
}

release_lock() {
  if [[ "$LOCK_HELD" == 1 ]]; then
    flock -u "$LOCK_FD" >/dev/null 2>&1 || true
    eval "exec ${LOCK_FD}>&-" || true
    LOCK_HELD=0
  fi
}

acquire_lock() {
  [[ "$DRY_RUN" == 1 ]] && return 0
  [[ ! -L "$LOCK_FILE" && ( ! -e "$LOCK_FILE" || -f "$LOCK_FILE" ) ]] \
    || die 'deploy lock path is unsafe'
  eval "exec {LOCK_FD}>>\"$LOCK_FILE\""
  if ! flock -n "$LOCK_FD"; then
    eval "exec ${LOCK_FD}>&-"
    die 'another api deploy operation is running'
  fi
  LOCK_HELD=1
  trap 'release_lock' EXIT
}

as_api() {
  if [[ "$DEPLOY_TEST_MODE" == 1 || "$(id -un)" == "$API_USER" ]]; then
    "$@"
  elif [[ "$(id -u)" == 0 ]]; then
    runuser -u "$API_USER" -- "$@"
  else
    die "must run as root or $API_USER"
  fi
}

git_api() { as_api git -C "$SOURCE_DIR" "$@"; }

remote_main_sha() {
  local output sha ref
  output="$(git_api ls-remote --exit-code "$GIT_REMOTE" "refs/heads/$GIT_REF")" \
    || die 'remote main ref cannot be read'
  read -r sha ref <<<"$output"
  is_sha "$sha" || die 'remote main did not return a full lowercase SHA'
  [[ "$ref" == "refs/heads/$GIT_REF" ]] || die 'remote returned an unexpected ref'
  printf '%s' "$sha"
}

current_sha() { git_api rev-parse HEAD; }

guard_clean_tree() {
  local bad
  bad="$(git_api status --porcelain | grep -vE '^\?\? node_modules/?$' || true)"
  [[ -z "$bad" ]] || die "source checkout has unexpected changes; refusing deploy:\n$bad"
}

require_reachable_sha() {
  local sha="$1"
  is_sha "$sha" || die "not a full lowercase SHA: $sha"
  git_api cat-file -e "$sha^{commit}" 2>/dev/null \
    || die "commit not fetched: $sha"
  git_api merge-base --is-ancestor "$sha" "refs/remotes/$GIT_REMOTE/$GIT_REF" \
    || die "sha is not reachable from $GIT_REMOTE/$GIT_REF: $sha"
}

backup_db() {
  local db ts dest count
  db="$(db_path)"
  [[ -f "$db" ]] || { log 'no database file; skipping backup'; return 0; }
  ts="$(date -u +%Y%m%d-%H%M%S)"
  dest="$API_ROOT/lab.db.backup-$ts"
  if [[ "$DRY_RUN" == 1 ]]; then log "dry-run: backup $db -> $dest"; return 0; fi
  as_api cp -- "$db" "$dest" || die 'database backup failed'
  log "database backed up to $dest"
  # Keep the newest KEEP_DB_BACKUPS backups.
  count=0
  while IFS= read -r old; do
    count=$((count + 1))
    if (( count > KEEP_DB_BACKUPS )); then
      as_api rm -f -- "$old"
    fi
  done < <(ls -1t "$API_ROOT"/lab.db.backup-* 2>/dev/null)
  return 0
}

install_deps_if_needed() {
  local old="$1" new="$2"
  if [[ -d "$SOURCE_DIR/node_modules" ]] \
    && ! git_api diff --name-only "$old" "$new" -- bun.lock package.json bunfig.toml | grep -q .; then
    log 'dependencies unchanged; skipping install'
    return 0
  fi
  [[ -x "$BUN_BIN" && ! -L "$BUN_BIN" ]] || die 'BUN_BIN must be an executable non-symlink path'
  [[ "$("$BUN_BIN" --version)" == 1.2.17 ]] || die 'BUN_BIN version must be exactly 1.2.17'
  log "installing frozen dependencies ($old -> $new)"
  run runuser -u "$API_USER" -- env -i \
    PATH="$(dirname "$BUN_BIN"):/usr/bin:/bin" HOME="$HOME_DIR" NODE_ENV=production \
    bash -c 'cd "$1" && exec "$2" install --frozen-lockfile' _ "$SOURCE_DIR" "$BUN_BIN"
}

seed_accounts() {
  # api.env is root:root 0600; systemd loads it as root and drops privileges,
  # so the service account never needs read access to the file itself.
  log 'seeding accounts from api.env (LAB_SEED_*/LAB_TEACHER_*/LAB_ADMIN_*)'
  run systemd-run --quiet --wait --collect --pipe \
    --uid="$API_USER" --gid="$API_GROUP" \
    -p "EnvironmentFile=$API_ENV_FILE" \
    -p "WorkingDirectory=$SOURCE_DIR" \
    -p NoNewPrivileges=yes -p PrivateTmp=yes \
    "$NODE_BIN" server/db/seed.ts
}

wait_health() {
  local port deadline
  port="$(api_port)"
  deadline=$((SECONDS + HEALTH_TIMEOUT_SEC))
  while (( SECONDS < deadline )); do
    if curl -fsS --max-time 3 "http://127.0.0.1:${port}/api/health" 2>/dev/null | grep -q '"ok":true'; then
      log "health ok on port $port"
      return 0
    fi
    sleep 1
  done
  return 1
}

service_control() {
  if [[ "$DEPLOY_TEST_MODE" == 1 ]]; then log "test-mode: systemctl $1 $API_SERVICE"; return 0; fi
  systemctl "$1" "$API_SERVICE"
}

write_state() { run bash -c 'printf "%s\n" "$1" > "$2"' _ "$1" "$2"; }

switch_to() {
  local target="$1"
  require_reachable_sha "$target"
  guard_clean_tree
  local current
  current="$(current_sha)"
  if [[ "$current" == "$target" ]]; then
    log "already at $target; strict no-op"
    if [[ "$DRY_RUN" != 1 && "$DEPLOY_TEST_MODE" != 1 ]]; then
      if ! systemctl is-active --quiet "$API_SERVICE"; then
        log 'service is not active; starting it'
        systemctl start "$API_SERVICE" || die 'service start failed'
      fi
      wait_health || die 'health check failed'
      write_state "$target" "$DEPLOYED_SHA_FILE"
    fi
    return 0
  fi
  [[ "$(remote_main_sha)" == "$(git_api rev-parse "refs/remotes/$GIT_REMOTE/$GIT_REF")" ]] \
    || die 'remote moved between fetch and deploy; rerun'
  # Record intent before touching the service so `rollback` always knows the
  # last known-good revision even if this run is interrupted.
  write_state "$current" "$PREVIOUS_SHA_FILE"
  log "deploying $current -> $target"
  run service_control stop || die 'service stop failed; deploy aborted'
  if ! { run backup_db \
      && run git_api checkout --quiet --detach "$target" \
      && install_deps_if_needed "$current" "$target"; }; then
    service_control start 2>/dev/null || true
    die 'switch failed mid-deploy; restart attempted — run `status`, then `rollback`'
  fi
  run service_control start || die 'service start failed'
  if [[ "$DRY_RUN" == 1 ]]; then return 0; fi
  if ! wait_health; then
    printf 'computing-lab-api-deploy: health check failed; service left for diagnosis.\n' >&2
    printf '  inspect: journalctl -u %s -n 100 --no-pager\n' "$API_SERVICE" >&2
    printf '  recover: %s rollback\n' "${BASH_SOURCE[0]}" >&2
    exit 1
  fi
  write_state "$target" "$DEPLOYED_SHA_FILE"
  log "deployed $target"
  # Seed runs only after the service is healthy: a seed failure must not
  # strand a stopped API.
  if [[ "$DO_SEED" == 1 ]]; then
    seed_accounts || die 'seed failed; deployed code is live but accounts were not seeded'
  fi
}

cmd_deploy() {
  while (($#)); do
    case "$1" in
      --sha) TARGET_SHA="${2:-}"; [[ -n "$TARGET_SHA" ]] || die '--sha needs a value'; shift 2 ;;
      --seed) DO_SEED=1; shift ;;
      --skip-static) SKIP_STATIC=1; shift ;;
      --dry-run) DRY_RUN=1; shift ;;
      *) die "unknown deploy option: $1" ;;
    esac
  done
  require_root; validate_config; ensure_state; acquire_lock
  git_api fetch --no-tags --prune "$GIT_REMOTE" "$GIT_REF" >/dev/null \
    || die 'git fetch failed'
  [[ -z "$TARGET_SHA" ]] && TARGET_SHA="$(git_api rev-parse "refs/remotes/$GIT_REMOTE/$GIT_REF")"
  switch_to "$TARGET_SHA"
  if [[ "$SKIP_STATIC" == 0 && "$DRY_RUN" == 0 ]]; then
    if systemctl list-unit-files "$STATIC_SERVICE" --no-legend 2>/dev/null | grep -q .; then
      log "triggering static reconcile ($STATIC_SERVICE)"
      systemctl start "$STATIC_SERVICE" || die 'static reconcile failed; API is live but dist/ may be stale'
    else
      log 'static reconcile service not installed; skipping'
    fi
  fi
}

cmd_rollback() {
  while (($#)); do
    case "$1" in
      --dry-run) DRY_RUN=1; shift ;;
      *) die "unknown rollback option: $1" ;;
    esac
  done
  require_root; validate_config; ensure_state; acquire_lock
  [[ -f "$PREVIOUS_SHA_FILE" ]] || die 'no recorded previous sha; nothing to roll back to'
  TARGET_SHA="$(<"$PREVIOUS_SHA_FILE")"
  is_sha "$TARGET_SHA" || die 'recorded previous sha is invalid'
  git_api fetch --no-tags --prune "$GIT_REMOTE" "$GIT_REF" >/dev/null || true
  log 'rolling back API code only; the database is NOT rolled back'
  log "  restore a backup manually if the schema changed: ls $API_ROOT/lab.db.backup-*"
  switch_to "$TARGET_SHA"
}

cmd_seed() {
  require_root; validate_config; ensure_state; acquire_lock
  seed_accounts
}

cmd_status() {
  validate_config
  local head remote deployed previous port
  head="$(current_sha)"
  remote="$(remote_main_sha 2>/dev/null || printf 'unreachable')"
  deployed='none'; [[ -f "$DEPLOYED_SHA_FILE" ]] && deployed="$(<"$DEPLOYED_SHA_FILE")"
  previous='none'; [[ -f "$PREVIOUS_SHA_FILE" ]] && previous="$(<"$PREVIOUS_SHA_FILE")"
  port="$(api_port)"
  printf 'head=%s\nremote=%s\ndeployed=%s\nprevious=%s\n' "$head" "$remote" "$deployed" "$previous"
  if [[ "$DEPLOY_TEST_MODE" == 1 ]]; then printf 'service=test-mode\n'; else
    printf 'service=%s\n' "$(systemctl is-active "$API_SERVICE" 2>/dev/null || true)"
  fi
  if curl -fsS --max-time 3 "http://127.0.0.1:${port}/api/health" 2>/dev/null | grep -q '"ok":true'; then
    printf 'health=ok\n'
  else
    printf 'health=fail\n'
  fi
}

usage() {
  cat <<'EOF'
usage: api-deploy.sh <command> [options]

  deploy [--sha <40-hex>] [--seed] [--skip-static] [--dry-run]
      Fast-forward the API source to origin/main (or --sha), back up the
      database, install frozen deps if the lockfile changed, optionally seed
      accounts, restart the service, gate on /api/health, then trigger the
      static reconcile service.
  rollback [--dry-run]
      Return the API source to the last recorded good sha and restart.
      Does not roll back the database; restore lab.db.backup-* by hand if
      the schema changed.
  seed
      Run server/db/seed.ts as the service user with api.env loaded.
  status
      Print head/remote/deployed/previous, service state, and health.

Config (optional, root-owned): /etc/computing-lab/api-deploy.env
  API_ROOT API_USER API_GROUP API_SERVICE STATIC_SERVICE GIT_REMOTE GIT_REF
  NODE_BIN BUN_BIN API_ENV_FILE KEEP_DB_BACKUPS HEALTH_TIMEOUT_SEC
EOF
}

command="${1:-}"
shift || true
case "$command" in
  deploy) cmd_deploy "$@" ;;
  rollback) cmd_rollback "$@" ;;
  seed) cmd_seed "$@" ;;
  status) cmd_status "$@" ;;
  -h|--help|help) usage ;;
  *) usage >&2; exit 1 ;;
esac
