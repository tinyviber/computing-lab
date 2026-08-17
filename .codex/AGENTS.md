# Local host safety rules

These rules are mandatory for agents working in this repository.

## Why these rules exist

This development Mac has repeated macOS 14.4.1 kernel panics while `node` is active. The reports point into kernel VM and filesystem/security paths, including `vm_page_alloc`, `_vm_page_insert_internal`, `_lookup`, AppleMobileFileIntegrity, and the sandbox. Treat this as host resource/OS instability, not as evidence that lesson code itself is safe to stress.

## Execution policy

- Run resource-heavy commands one at a time. Never start tests, builds, installs, E2E, or agent shell jobs in parallel on this host.
- Prefer `nice -n 10` for local Bun/Node commands when supported.
- Vitest: use one worker and no watch mode: `--maxWorkers=1 --minWorkers=1`.
- Playwright: use `--workers=1`; run only the relevant spec locally. Do not use `--with-deps` locally unless explicitly required; CI owns browser dependency installation.
- Validate in this order: targeted tests, typecheck/lint/format, build, then one targeted E2E. Run the full suite at most once after targeted checks pass.
- Do not repeat a passing heavy command. After a failure, diagnose from its output before retrying.
- Do not run recursive scans from `/`, `/Users`, or other broad roots. Scope `rg`, `find`, and file operations to the repository.
- Do not leave dev servers, watchers, Playwright workers, or test processes running. Check and clean up only processes started by the agent.

## Resource checks and stop conditions

- Before a heavy command, inspect `ps`, `vm_stat`, and available disk space when practical.
- If `node`, `bun`, `syspolicyd`, `apfsd`, or filesystem activity is already consuming substantial CPU/memory, wait or stop; do not add another workload.
- If a new panic report, reboot, sustained system freeze, or repeated process hang appears, stop all heavy work immediately. Do not retry the command. Report the evidence and continue only with small read-only checks or ask the user.
- Keep commands bounded with short polling intervals. Never use an unbounded watcher or long blocking sleep.

## Safe handoff

Agents must report the exact command, worker count, and whether it was serial. A passing local test is not permission to increase concurrency. Remote CI may run its normal parallel jobs; local execution remains single-worker.
