#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d)"
CADDY_BIN="${CADDY_BIN:-$(command -v caddy || true)}"
CADDY_TEST_VERSION="${CADDY_TEST_VERSION:-2.10.2}"
CADDY_PID=""
trap 'if [[ -n "$CADDY_PID" ]]; then kill "$CADDY_PID" >/dev/null 2>&1 || true; wait "$CADDY_PID" >/dev/null 2>&1 || true; fi; find "$TMP" -type f -delete 2>/dev/null || true; rmdir "$TMP" 2>/dev/null || true' EXIT

fail() { printf 'not ok - %s\n' "$1" >&2; exit 1; }
pass() { printf 'ok - %s\n' "$1"; }

[[ -n "$CADDY_BIN" && -x "$CADDY_BIN" ]] \
  || fail 'Caddy is required; provide CADDY_BIN to the pinned test binary'

version="$("$CADDY_BIN" version 2>/dev/null | sed -n 's/^v\([0-9][0-9.]*\).*/\1/p')"
[[ "$version" == "$CADDY_TEST_VERSION" ]] \
  || fail "Caddy version must be $CADDY_TEST_VERSION, got ${version:-unknown}"

DIST="$TMP/current/dist"
mkdir -p "$DIST/assets"
printf '<!doctype html><script type="module" src="/assets/app.js"></script>\n' >"$DIST/index.html"
printf 'console.log("fixture")\n' >"$DIST/assets/app.js"

PORT="$(python3 - <<'PY'
import socket

with socket.socket() as sock:
    sock.bind(("127.0.0.1", 0))
    print(sock.getsockname()[1])
PY
)"
SITE_FILE="$TMP/Caddyfile"
cat >"$SITE_FILE" <<'EOF'
{
    auto_https off
}

EOF
sed \
  -e "s|{\$SITE_ADDRESS}|http://127.0.0.1:$PORT|g" \
  -e "s|{\$DEPLOY_ROOT}|$TMP|g" \
  "$ROOT/deploy/Caddyfile.example" >>"$SITE_FILE"

"$CADDY_BIN" validate --config "$SITE_FILE" --adapter caddyfile >/dev/null 2>&1 \
  || fail 'Caddy rejected the production site template'
pass 'Caddy validates the production site template'

"$CADDY_BIN" run --config "$SITE_FILE" --adapter caddyfile >"$TMP/caddy.log" 2>&1 &
CADDY_PID=$!

for _ in {1..100}; do
  if curl --noproxy '*' -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1; then
    break
  fi
  sleep 0.05
done

request_status() {
  local path="$1" body="$TMP/body"
  HTTP_STATUS="$(curl --noproxy '*' -sS -o "$body" -w '%{http_code}' "http://127.0.0.1:$PORT$path")"
  BODY_FILE="$body"
}

request_status /
[[ "$HTTP_STATUS" == 200 ]] || fail "root returned $HTTP_STATUS"
grep -Fq 'assets/app.js' "$BODY_FILE" || fail 'root did not serve index.html'

request_status /labs/image-encoding
[[ "$HTTP_STATUS" == 200 ]] || fail "SPA deep route returned $HTTP_STATUS"
grep -Fq 'assets/app.js' "$BODY_FILE" || fail 'SPA deep route did not fall back to index.html'

request_status /assets/app.js
[[ "$HTTP_STATUS" == 200 ]] || fail "real asset returned $HTTP_STATUS"
grep -Fq 'console.log' "$BODY_FILE" || fail 'real asset body was not served'

request_status /assets/missing.js
[[ "$HTTP_STATUS" == 404 ]] || fail "missing asset returned $HTTP_STATUS"
if grep -Fq 'assets/app.js' "$BODY_FILE"; then
  fail 'missing asset was rewritten to index.html'
fi

request_status /computing-lab/assets/app.js
[[ "$HTTP_STATUS" == 404 ]] || fail "subpath asset returned $HTTP_STATUS"
pass 'Caddy serves root SPA fallback and preserves static 404 semantics'
