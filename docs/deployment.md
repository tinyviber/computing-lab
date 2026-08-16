# Computing Lab static deployment foundation

This repository is a static Vite SPA. Tencent Cloud runs no application server,
Node/Bun web process, Docker service, database, migration, or Computing Lab
systemd service. Caddy reads immutable files only.

## Architecture

```text
GitHub main
   │
   ├─ CI: checks + e2e-base-path (Bun 1.2.17, frozen install, build, E2E)
   │
   └─ sync-gitee.yml: canonical SHA + green jobs → exact Gitee main
                                      │
                                      ▼
                         Tencent host timer / manual reconcile
                                      │
                 ls-remote exact SHA + fetch + detached archive
                                      │
                    isolated staging / Bun build / local smoke
                                      │
                 final Gitee SHA check → atomic current symlink
                                      │
                         Caddy → current/dist (static only)
```

GitHub remains canonical. Host trusts only Gitee `main`, because the existing
sync workflow updates that ref only after GitHub canonical-ref and required CI
job checks pass. Host never receives a GitHub SSH credential and GitHub Actions
never SSHs Tencent.

The production host artifact is root-built (`VITE_BASE_PATH=/`) and served only
at its dedicated subdomain. The repository's `/computing-lab/` build remains
covered by application E2E, but is not another artifact contract for this
`current` release.

## Host layout

```text
$DEPLOY_ROOT/
  source.git/                 # bare read-only-source cache
  releases/<40-char-sha>/
    dist/                     # only production payload
    release.env               # SHA, Bun, base, digests, smoke result
  current -> releases/<sha>   # Caddy's only production pointer
  previous -> releases/<sha>  # rollback target
  state/
    current.sha
    previous.sha
    hold                      # pause automatic reconcile after manual rollback
    transaction               # crash-recovery intent, normally absent
    deploy.lock               # util-linux flock lock file
  work/                       # disposable source/build staging
  quarantine/                 # recoverable invalid release directories
```

`node_modules` never enters `releases/`. It exists only under disposable
staging and is removed with the staging directory.

## Invariants

- Production target is full lowercase SHA from `refs/heads/main`; short SHA,
  branch checkout, mutable tag, and non-main ref are rejected.
- Production host configuration requires `VITE_BASE_PATH=/`; a subpath build is
  rejected before any release state changes.
- Bun version must be exactly `1.2.17`; install is frozen against `bun.lock`.
- Git always receives a reconciler-built `GIT_SSH_COMMAND` from the host SSH
  config. It uses a pinned key/known_hosts file, strict host-key checking,
  batch mode, no agent, no global known_hosts, and no connection sharing.
- Build and smoke run in unique staging, with deployment config excluded from
  the build environment.
- `current` changes only after exact-source fetch, build, static validation,
  staged smoke, and a final exact Gitee SHA check.
- Build, install, smoke, fetch, lock, and stale-ref failure leave current and
  previous release pointers unchanged.
- Pointer replacement uses a same-filesystem temporary symlink and rename.
  A durable transaction intent lets the next locked command finish or discard
  an interrupted pointer update; marker files are derived observability.
- All reconcile, rollback, hold, resume, and cleanup operations share one
  nonblocking `flock` lock. Concurrent operations fail instead of interleaving.
- Rollback writes `hold` before switching pointers. Timer runs while hold exists
  are strict no-ops. `resume` only clears hold; operator chooses when to deploy.
- Cleanup protects resolved `current` and `previous` targets, validates SHA
  directory names, and quarantines invalid unprotected releases instead of
  deleting them blindly.
- Caddy serves real files first. Only extensionless non-asset paths fall back
  to `index.html`; missing dotted or `/assets/*` files return 404.

The final remote read narrows, but cannot remove, the unavoidable race after a
remote ref check. A ref move during build is detected and refused. A move after
the final read publishes the already-qualified SHA; the next timer observes the
new SHA and converges.

## Configuration

Start from [deploy/host.env.example](../deploy/host.env.example). Keep the real
file outside Git, for example `/etc/computing-lab/deploy.env`, mode `0640`,
owned by `root:computing-lab`. The service needs to read this file; do not put
private keys or secrets in it. Host-specific values are:

- `DEPLOY_ROOT`: absolute, non-root deployment directory.
- `GITEE_REMOTE`: read-only SSH URL in `git@host:path` or
  `ssh://git@host/path` form; its host must equal `GITEE_SSH_HOST`.
- `GITEE_SSH_HOST`: host entry used by the SSH config and effective `ssh -G`
  validation.
- `GITEE_SSH_CONFIG`: root-owned, group-readable OpenSSH config file.
- `GITEE_SSH_KEY`: deployment private key, mode `0600`.
- `GITEE_KNOWN_HOSTS`: pinned known_hosts file, no global fallback.
- `SSH_BIN`: absolute, executable, non-symlink OpenSSH client.
- `BUN_BIN`: absolute, non-symlink Bun 1.2.17 executable.
- `VITE_BASE_PATH`: must be `/` for this production reconciler.
- `KEEP_RELEASES`: number of non-current, non-previous valid releases retained.

Do not put private keys, known-host contents, real domains, IPs, or credentials
in this repository. Do not set or export `GIT_SSH_COMMAND`; the reconciler
constructs it from the explicit SSH fields and fails if an inherited command is
present.

## First bootstrap (manual Tencent work)

Run these steps on a new host later, when computer access is available. This
runbook intentionally contains placeholders, not real infrastructure values.

1. Install system software: Git, Bash, util-linux `flock`, Python 3, SHA-256
   tooling, OpenSSH client, curl, Caddy, and Bun 1.2.17. Install Chromium only if the host
   smoke policy uses browser-level checks; the checked-in smoke is local Bun
   HTTP and needs no external network.
2. Create a dedicated non-root identity and directories. Example:

   ```sh
   sudo groupadd --system computing-lab
   sudo useradd --system --gid computing-lab --home /nonexistent --shell /usr/sbin/nologin computing-lab
   sudo usermod --append --groups computing-lab caddy
   sudo install -d -o computing-lab -g computing-lab -m 02750 /srv/computing-lab
   sudo install -d -o root -g root -m 0755 /etc/computing-lab
   ```

   The `computing-lab` group is read/execute for Caddy; the deployment user is
   the only writer. Keep parent directories root-owned and non-symlink.

3. Install Bun 1.2.17 into a root-owned, non-symlink path. Verify:

   ```sh
   /opt/computing-lab/runtime/bun/bin/bun --version
   ```

   It must print exactly `1.2.17`.

4. Give `computing-lab` read-only Gitee access. Use a dedicated deploy key,
   strict permissions, and a pinned host key. Do not use an agent-only setup:
   the same explicit files must work for both systemd and manual invocation.

   ```sh
   sudo install -d -o root -g computing-lab -m 0750 /etc/computing-lab/keys
   # Copy an operator-verified read-only private key; never paste it into Git.
   sudo install -o computing-lab -g computing-lab -m 0600 /path/to/gitee-readonly-key /etc/computing-lab/keys/gitee-readonly
   sudo install -o root -g computing-lab -m 0640 deploy/gitee_ssh_config.example /etc/computing-lab/gitee_ssh_config
   # Install an operator-verified, pinned Gitee host-key line; do not trust an unreviewed scan.
   sudo install -o root -g computing-lab -m 0640 /path/to/pinned-known-hosts /etc/computing-lab/known_hosts
   ```

   Set the matching paths in `deploy.env`. The config's `Host` entry,
   `GITEE_SSH_HOST`, and the host in `GITEE_REMOTE` must agree. Validate the
   effective settings without connecting:

   ```sh
   sudo -u computing-lab bash -c '
     set -Eeuo pipefail
     source /etc/computing-lab/deploy.env
     exec env -i PATH=/usr/bin:/bin "$SSH_BIN" -G -F "$GITEE_SSH_CONFIG" \
       -i "$GITEE_SSH_KEY" \
       -o BatchMode=yes -o StrictHostKeyChecking=yes -o IdentitiesOnly=yes \
       -o UserKnownHostsFile="$GITEE_KNOWN_HOSTS" \
       -o GlobalKnownHostsFile=/dev/null -o IdentityAgent=none \
       -o ControlMaster=no -o ControlPath=none "$GITEE_SSH_HOST"
   '
   ```

   Then test `git ls-remote` as `computing-lab` using the reconciler command;
   do not give the identity write access or access to unrelated repositories.
   Do not add an operator `export`; the script sources the same `deploy.env`
   for systemd and manual runs.

5. Install the checked-in tooling at a stable root-owned path. The script must
   not run from `current` or a mutable checkout:

   ```sh
   sudo install -d -o root -g root -m 0755 /usr/local/libexec/computing-lab
   sudo install -o root -g root -m 0755 deploy/reconcile.sh /usr/local/libexec/computing-lab/reconcile.sh
   sudo install -o root -g root -m 0755 deploy/smoke.mjs /usr/local/libexec/computing-lab/smoke.mjs
   sudo install -o root -g root -m 0755 deploy/fsync.py /usr/local/libexec/computing-lab/fsync.py
   ```

   Install the same reviewed tool set together. Update requires stopping the
   timer, installing all files, checking shell/Python syntax, then restarting.

6. Copy and protect the host env. Set `DEPLOY_CONFIG` in systemd, not in Git.
   Ensure it is `root:computing-lab` mode `0640`, and `DEPLOY_ROOT` is owned by
   `computing-lab:computing-lab` mode `02750`; Caddy gets read/execute
   traversal only. For example:

   ```sh
   sudo install -o root -g computing-lab -m 0640 deploy/host.env.example /etc/computing-lab/deploy.env
   sudo chmod 0640 /etc/computing-lab/deploy.env
   # Edit only host values; keep key contents out of this file.
   ```

## Caddy installation and validation

First inspect the existing Caddy layout. Never assume `/etc/caddy/sites` is
imported:

```sh
sudo test -r /etc/caddy/Caddyfile
sudo sed -n '1,240p' /etc/caddy/Caddyfile
sudo grep -nE '^[[:space:]]*import[[:space:]]+' /etc/caddy/Caddyfile || true
sudo find /etc/caddy -maxdepth 2 -type f -print
```

If the main file already imports `/etc/caddy/sites/*.caddy` (or an equivalent
reviewed pattern), install the private Computing Lab site into that directory.
If it does not, preserve the existing file first, then use `sudoedit` to add
exactly one top-level import line:

```text
import /etc/caddy/sites/computing-lab.caddy
```

For a missing import, back up before editing and verify the import appears once:

```sh
sudo cp -a --preserve=mode,ownership /etc/caddy/Caddyfile \
  "/etc/caddy/Caddyfile.bak.$(date -u +%Y%m%dT%H%M%SZ)"
sudoedit /etc/caddy/Caddyfile
test "$(sudo grep -Fxc 'import /etc/caddy/sites/computing-lab.caddy' /etc/caddy/Caddyfile)" -eq 1
```

Do not overwrite the main file or existing site blocks. If the main config uses
another adapter/format, merge the reviewed root-only site block in that format
instead of adding an incompatible Caddyfile import. Prove the final ownership
and import before reload:

```sh
sudo install -d -o root -g root -m 0755 /etc/caddy/sites
sudo install -o root -g root -m 0644 deploy/Caddyfile.example /etc/caddy/sites/computing-lab.caddy
# Replace only {$SITE_ADDRESS} and {$DEPLOY_ROOT} in this host-managed copy.
sudo grep -nE '^[[:space:]]*import[[:space:]]+' /etc/caddy/Caddyfile
sudo caddy adapt --config /etc/caddy/Caddyfile --adapter caddyfile --pretty >/tmp/computing-lab-caddy.json
sudo grep -F '/current/dist' /tmp/computing-lab-caddy.json
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl restart caddy  # once after adding caddy to the computing-lab group
sudo systemctl reload caddy   # later reviewed site-file changes
```

The repository's optional Caddy behavior test never downloads a server or
contacts Gitee/Tencent. Run it only when a reviewed, pinned Caddy binary is
already available:

```sh
CADDY_BIN=/path/to/pinned/caddy CADDY_TEST_VERSION=2.10.2 bun run test:caddy
```

The production artifact is built with `VITE_BASE_PATH=/` and served only at the
dedicated subdomain. Before enabling the timer, verify over the real site or a
host-only listener: `/`, one extensionless lab deep link, a known root asset,
and a missing `.js` asset returning `404`. Never use `try_files` to turn
missing static assets into HTML. The `/computing-lab/` build remains an
application E2E compatibility check, not a second Caddy production route.

## First exact-SHA deployment and timer

```sh
sudo -u computing-lab /usr/local/libexec/computing-lab/reconcile.sh status
sudo -u computing-lab /usr/local/libexec/computing-lab/reconcile.sh reconcile
sudo -u computing-lab /usr/local/libexec/computing-lab/reconcile.sh status
sudo install -o root -g root -m 0644 deploy/systemd/computing-lab-reconcile.service /etc/systemd/system/
sudo install -o root -g root -m 0644 deploy/systemd/computing-lab-reconcile.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now computing-lab-reconcile.timer
sudo systemctl status computing-lab-reconcile.timer
sudo journalctl -u computing-lab-reconcile.service -n 100 --no-pager
```

Confirm `current` resolves to the exact Gitee SHA and `current/dist/index.html`
is readable by Caddy. `status` also validates the effective SSH transport.
There is no long-running web process for this app.

## Health, smoke, rollback

Health is static: fetch `/`, a direct deep route, one real root-based hashed
asset, and a missing `.js` asset expecting `404`. A failed build/smoke/stale
check leaves the old release serving. Inspect the service journal and `status`;
do not delete `current` manually.

For an emergency rollback:

```sh
sudo -u computing-lab /usr/local/libexec/computing-lab/reconcile.sh rollback
sudo -u computing-lab /usr/local/libexec/computing-lab/reconcile.sh status
# investigate and validate Caddy/HTTP while hold is present
sudo -u computing-lab /usr/local/libexec/computing-lab/reconcile.sh resume
# reconcile only after operator approval
sudo -u computing-lab /usr/local/libexec/computing-lab/reconcile.sh reconcile
```

Rollback swaps `current` and `previous` under the same lock and leaves hold
active, so the next timer cannot silently undo the operator decision.

## Disaster recovery

1. Stop the timer; preserve `state/transaction`, `state/current.sha`, and
   `state/previous.sha` for diagnosis.
2. If a transaction exists, run `status` and then a locked `cleanup`/`resume`
   only after confirming its pointer targets. The next reconcile/rollback
   performs transaction recovery or fails closed on an unexpected pointer.
3. If the host is lost, provision a fresh host with the same non-root identity,
   Bun pin, Caddy, env, read-only Gitee access, and reviewed tooling. The
   qualified Gitee `main` SHA is the desired state; source cache can be rebuilt.
4. Run an exact-SHA reconcile, validate root/deep-route/assets, then enable the
   timer. Keep the old host isolated until the new host is verified.

Never force a pointer to an unverified branch, delete a current release, erase
the quarantine directory, or change databases/secrets—none are part of this
static deployment.
