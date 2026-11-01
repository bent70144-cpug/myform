# ADR-0002: Embedded Postgres and Mailpit instead of Docker locally

**Status:** Accepted (M0)

## Context

Development machines and CI cannot rely on Docker: agents run without root, and Docker cannot be installed non-interactively. Testcontainers is therefore out.

## Decision

- **Postgres:** npm package `embedded-postgres` (wrapping `@embedded-postgres/linux-x64`, Postgres 17.x binaries). No daemon, no root. The package is pinned and listed in `pnpm.onlyBuiltDependencies` so pnpm runs its symlink-hydration script; the test helper re-hydrates at runtime as a fallback (`autoRehydrateSymlinks`).
- **Mailpit:** static Go binary downloaded on first use by `scripts/dev-env.mjs`; SMTP on `127.0.0.1:1025`, UI/API on `127.0.0.1:8025` (bind flags require explicit `ip:port`).
- `packages/db` exposes `startTestPostgres()`: boots a temporary instance on a free port with a temp data dir, runs the admin bootstrap + migrations as the right roles, hands out admin/migrator/app/worker URLs, and on `stop()` terminates leftover backends before shutdown so no 57P01 teardown races leak into test runs.

## Consequences

- Same substitute is used consistently by every DB-seamed test (api, db, queue, worker) and by interactive dev.
- Linux x64 only until another embedded target is needed; production uses real Postgres (Neon), so this is a dev/test-only concern.
