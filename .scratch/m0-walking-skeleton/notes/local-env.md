# Local environment notes (verified 2026-10-31)

Shared context for all implementer agents. Read this before touching dev-infra.

## Machine

- Linux Mint 22.3, user `ben` (uid 1000). `sudo` requires an interactive password — **not available to agents**. No Docker, and it cannot be installed non-interactively.
- Node v24.22.0, pnpm 12.15.0, git 2.43.0. Network access to npm and GitHub works.
- Repo root `/media/ben/my/form-platform` is on `/dev/sda5` (25 GB free). `/home/ben` is a **different filesystem**, so pnpm's default store hardlinks do not work across it — set the pnpm store on the repo device (e.g. global `pnpm config set store-dir /media/ben/my/.pnpm-store`) so worktree node_modules stay cheap.

## Docker substitute (verified working — use exactly this)

Ticket 01 must document and implement this substitute; do not try to install Docker.

1. **Postgres: npm package `embedded-postgres`** (wraps `@embedded-postgres/linux-x64`, Postgres 17.4 binaries). No root, no daemon. Verified boots, queries, stops cleanly.
   - pnpm blocks its postinstall hydration script by default → either add `@embedded-postgres/linux-x64` to `pnpm.onlyBuiltDependencies` in `package.json`, or run `node node_modules/@embedded-postgres/linux-x64/scripts/hydrate-symlinks.js` after install.
   - JS API: `new EmbeddedPostgres({ databaseDir, user, password, port, persistent: false })` → `await pg.initialise(); await pg.start(); await pg.createDatabase('x'); pg.getPgClient()`, then `await pg.stop()`.
2. **Mailpit: static Go binary** from GitHub releases (current v1.33.0):
   `curl -sL -o mailpit.tar.gz https://github.com/axllent/mailpit/releases/download/v1.33.0/mailpit-linux-amd64.tar.gz`
   - Bind flags require explicit `ip:port`: `-s 127.0.0.1:1025 -l 127.0.0.1:8025` (bare `-s 1025` errors). UI/API on :8025 verified 200; SMTP on :1025.
3. **Consequence for tests:** Testcontainers is out. Provide a test helper (e.g. `packages/db/test-postgres`) that boots a temporary `embedded-postgres` instance on a free port with a temp data dir, runs the admin bootstrap + migrations as the right roles, and hands out pooled/direct URLs. This is the documented substitute "used consistently" by the API and DB seams. A small `scripts/dev-env` (start/stop/status) manages a long-running local Postgres + Mailpit for interactive dev.

## Roles and bootstrap (from spec)

One-time admin bootstrap (admin/superuser connection, e.g. the embedded instance's initial superuser) creates schemas `app`, `auth`, `pgboss` and roles `migrator`, `app_user`, `worker_user`, NOLOGIN `fn_owner`; no runtime role has BYPASSRLS. Role passwords via env vars. Migrations run as `migrator` (grant `fn_owner` to `migrator` with SET option so migrations can assign function ownership).

## Orchestration notes (for agents on later tickets)

- Spec: `.scratch/m0-walking-skeleton/spec.md`; tickets: `.scratch/m0-walking-skeleton/issues/`.
- Integration branch: `m0-walking-skeleton`. Ticket branches: `ticket/NN-slug`, one git worktree each under `/media/ben/my/fp-wt/NN-<slug>`.
- External-credential steps (Neon project, Render service, GitHub Actions secrets, email-provider domain verification) cannot be executed by agents. Implement everything verifiable locally, write the scripts/CI files, and record the exact pending-user checklist in the ticket's `## Comments`.
