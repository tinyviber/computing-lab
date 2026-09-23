#!/usr/bin/env bash
# api-deploy.example.sh — versioned reference copy of the host-local
# api-deploy.sh contract documented in docs/deployment.md#api-process-deployment.
#
# The live script lives in gitignored local/deploy/api-deploy.sh and is
# installed at /usr/local/libexec/computing-lab-api/api-deploy.sh. Keep this
# example in sync when the documented behavior changes.
#
#   deploy [--sha <sha>] [--seed] [--dry-run]
#   rollback
#   status
#
# Flow (deploy): git fetch → resolve SHA (origin/main or --sha) → assert clean
# checkout → record previous SHA → systemctl stop → cp lab.db backup →
# git checkout --detach <sha> → bun install --frozen-lockfile when the
# lockfile/manifest changed → optional seed via systemd-run → systemctl start
# → poll /api/health → start computing-lab-reconcile.service.
# rollback returns to state/previous.sha and never touches the database.
set -Eeuo pipefail

# --- Configuration ----------------------------------------------------------
# Overrides live in /etc/computing-lab/api-deploy.env (root-owned, must not be
# group/world-writable).
API_ROOT="${API_ROOT:-/srv/computing-lab-api}"
API_USER="${API_USER:-computing-lab}"
API_SERVICE="${API_SERVICE:-computing-lab-api.service}"
NODE_BIN="${NODE_BIN:-node}"
BUN_BIN="${BUN_BIN:-bun}"
API_ENV_FILE="${API_ENV_FILE:-/etc/computing-lab/api.env}"
KEEP_DB_BACKUPS="${KEEP_DB_BACKUPS:-10}"
HEALTH_TIMEOUT_SEC="${HEALTH_TIMEOUT_SEC:-30}"
HEALTH_PORT="${HEALTH_PORT:-8788}"
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-/etc/computing-lab/api-deploy.env}"
RECONCILE_SERVICE="${RECONCILE_SERVICE:-computing-lab-reconcile.service}"
REMOTE="${REMOTE:-origin}"
BRANCH="${BRANCH:-main}"

if [[ -f "$DEPLOY_ENV_FILE" ]]; then
    perms="$(stat -c '%a' "$DEPLOY_ENV_FILE")"
    if (( 8#$perms & 8#077 )); then
        echo "refusing: $DEPLOY_ENV_FILE is group/world-accessible ($perms)" >&2
        exit 1
    fi
    # shellcheck disable=SC1090
    . "$DEPLOY_ENV_FILE"
fi

SOURCE_DIR="$API_ROOT/source"
STATE_DIR="$API_ROOT/state"
PREVIOUS_SHA_FILE="$STATE_DIR/previous.sha"
DB_PATH="${LAB_DB_PATH:-$API_ROOT/data/lab.db}"

log() { printf '[api-deploy] %s\n' "$*"; }
die() { printf '[api-deploy] error: %s\n' "$*" >&2; exit 1; }

as_user() { runuser -u "$API_USER" -- "$@"; }

current_sha() { as_user git -C "$SOURCE_DIR" rev-parse HEAD; }

require_clean_checkout() {
    # Only untracked node_modules/ is tolerated; anything else means the
    # checkout drifted and deploying would bury the change.
    local dirty
    dirty="$(as_user git -C "$SOURCE_DIR" status --porcelain \
        | grep -v '^?? node_modules/' || true)"
    [[ -z "$dirty" ]] || die "checkout is not clean:\n$dirty"
}

install_deps_if_changed() {
    local before="$1"
    if as_user git -C "$SOURCE_DIR" diff --quiet "$before" HEAD -- \
        package.json bun.lock bun.lockb 2>/dev/null; then
        log 'dependencies unchanged; skipping bun install'
    else
        log 'manifest/lockfile changed; running bun install --frozen-lockfile'
        as_user env PATH="$(dirname "$BUN_BIN"):$(dirname "$NODE_BIN"):$PATH" \
            "$BUN_BIN" install --frozen-lockfile --cwd "$SOURCE_DIR"
    fi
}

backup_db() {
    [[ -f "$DB_PATH" ]] || return 0
    local stamp="$STATE_DIR/lab.db.backup-$(date -u +%Y%m%dT%H%M%SZ)"
    cp -p "$DB_PATH" "$stamp"
    log "db backup: $stamp"
    # Prune oldest backups beyond KEEP_DB_BACKUPS.
    ls -1t "$STATE_DIR"/lab.db.backup-* 2>/dev/null | tail -n "+$((KEEP_DB_BACKUPS + 1))" \
        | xargs -r rm -f
}

health_gate() {
    local deadline=$((SECONDS + HEALTH_TIMEOUT_SEC)) url="http://127.0.0.1:${HEALTH_PORT}/api/health"
    while (( SECONDS < deadline )); do
        if curl -fsS --noproxy '*' -o /dev/null "$url" 2>/dev/null; then
            log 'health check passed'
            return 0
        fi
        sleep 1
    done
    die "API failed health gate within ${HEALTH_TIMEOUT_SEC}s (see journalctl -u $API_SERVICE)"
}

run_seed() {
    log "seeding via systemd-run (env file: $API_ENV_FILE)"
    systemd-run --quiet --wait --collect \
        -p "EnvironmentFile=$API_ENV_FILE" \
        -p "User=$API_USER" \
        -p "WorkingDirectory=$SOURCE_DIR" \
        --unit=computing-lab-api-seed \
        "$NODE_BIN" server/db/seed.ts
}

deploy() {
    local target_sha="" seed=0 dry=0
    while (($#)); do
        case "$1" in
            --sha) target_sha="${2:?--sha needs a value}"; shift 2 ;;
            --seed) seed=1; shift ;;
            --dry-run) dry=1; shift ;;
            *) die "unknown deploy flag: $1" ;;
        esac
    done

    mkdir -p "$STATE_DIR"
    log "fetching $REMOTE"
    as_user git -C "$SOURCE_DIR" fetch --quiet --prune "$REMOTE"
    if [[ -z "$target_sha" ]]; then
        target_sha="$(as_user git -C "$SOURCE_DIR" rev-parse "$REMOTE/$BRANCH")"
    else
        target_sha="$(as_user git -C "$SOURCE_DIR" rev-parse --verify "$target_sha^{commit}")"
    fi
    local before; before="$(current_sha)"
    log "deploy $before -> $target_sha"

    if [[ "$before" == "$target_sha" ]]; then
        log 'already at target; deploy is a no-op'
        (( seed )) && run_seed
        return 0
    fi

    if (( dry )); then
        log "dry-run: would stop $API_SERVICE, checkout $target_sha, restart"
        return 0
    fi

    require_clean_checkout
    printf '%s\n' "$before" > "$PREVIOUS_SHA_FILE"

    systemctl stop "$API_SERVICE"
    backup_db
    as_user git -C "$SOURCE_DIR" checkout --quiet --detach "$target_sha"
    install_deps_if_changed "$before"
    (( seed )) && run_seed
    systemctl start "$API_SERVICE"
    health_gate
    if systemctl list-unit-files "$RECONCILE_SERVICE" >/dev/null 2>&1 \
        && systemctl cat "$RECONCILE_SERVICE" >/dev/null 2>&1; then
        systemctl start "$RECONCILE_SERVICE" || log 'warning: reconcile service failed to start'
    fi
    log "deployed $target_sha"
}

rollback() {
    [[ -f "$PREVIOUS_SHA_FILE" ]] || die "no previous SHA recorded ($PREVIOUS_SHA_FILE)"
    local target; target="$(cat "$PREVIOUS_SHA_FILE")"
    log "rollback -> $target"
    deploy --sha "$target"
}

status() {
    log "current:  $(current_sha 2>/dev/null || echo unknown)"
    log "previous: $(cat "$PREVIOUS_SHA_FILE" 2>/dev/null || echo none)"
    systemctl --no-pager --full status "$API_SERVICE" | sed -n '1,12p' || true
}

case "${1:-}" in
    deploy) shift; deploy "$@" ;;
    rollback) rollback ;;
    status) status ;;
    *) echo "usage: $0 {deploy [--sha <sha>] [--seed] [--dry-run]|rollback|status}" >&2; exit 2 ;;
esac
