# 01: Monorepo foundation and local health

**Spec:** `../spec.md`

**What to build:** A runnable monorepo foundation and a health path from browser to API to Postgres, with the local development environment, one-time admin bootstrap, and tenant-safe database roles in place. No product auth or forms yet.

**Blocked by:** None

**Status:** ready-for-human

- [ ] Docker is installed and `docker compose` can start Postgres and Mailpit; if Docker cannot be installed, a documented substitute is in place and used consistently.
- [ ] The pnpm + Turborepo workspace contains web, API, and worker entrypoints, shared config packages, and lint/typecheck/test scripts. It includes the contracts, form-schema, i18n, UI, queue, auth, and config packages.
- [ ] A one-time admin bootstrap script, run with admin credentials and not as a migration, creates the `app`, `auth`, and `pgboss` schemas and the `migrator`, `app_user`, `worker_user`, and NOLOGIN `fn_owner` roles. All runtime roles lack `BYPASSRLS`; role passwords come from environment variables and never appear in migration files. The admin grants `fn_owner` to `migrator` with `SET` so migrations can assign function ownership.
- [ ] Migrations run as `migrator` after the admin bootstrap; they create tables, RLS policies, functions, and grants. The pg-boss schema DDL is installed by the migrator, and the runtime role gets DML only; the spike confirms the pg-boss version can skip its own migration.
- [ ] The transaction wrapper sets `app.workspace_id` and `app.user_id` transaction-locally and refuses tenant queries outside a transaction.
- [ ] `GET /v1/health` reports liveness and database reachability and is reachable through the Next.js `/v1/*` rewrite.
- [ ] One documented command starts web, API, and worker; the worker logs a heartbeat.
- [ ] CI runs install, lint, typecheck, and tests.
- [ ] A structured logger redacts cookies, auth tokens, and authorization headers; environment configuration is Zod-validated and fails at startup on missing or invalid values.
- [ ] The contracts package owns Zod request/response schemas and OpenAPI generation; an RFC 9457 Problem Details filter produces stable error bodies; `/v1/openapi.json` has a snapshot test.
- [ ] The i18n package is scaffolded with an English message catalog and typed key helpers; UI strings and API error messages are looked up by key rather than hardcoded.
- [ ] The web build and lint fail if the web app imports the database package or the server auth entrypoint; CI checks the web environment definition and the supervisor's child environment allowlist for database credentials and auth secrets.
- [ ] No product authentication, forms, or submissions are implemented in this slice.

## Comments

**2026-11-01 (orchestrator):** Implemented in this sandbox (fresh rebuild; prior WIP on the user's local machine was never pushed). All 13 checkboxes done except where noted:

- Docker substitute implemented per `local-env.md`: embedded-postgres + Mailpit via `scripts/dev-env.mjs` (documented in ADR-0002). No Docker anywhere.
- pnpm+Turborepo workspace with web/api/worker + config/logger/contracts/form-schema/i18n/db/queue/ui/auth/logic packages.
- Admin bootstrap (schemas + roles, no BYPASSRLS, env-var passwords), migrator-owned pg-boss DDL (`migrate:false` + `getConstructionPlans`), transaction wrapper with SET LOCAL + refuses tenant queries outside tx — all covered by 12 db-seam tests.
- `GET /v1/health` (liveness + DB) reachable through Next `/v1/*` rewrite; worker heartbeat; `pnpm dev` single command.
- CI: `.github/workflows/ci.yml` (install/lint/typecheck/test).
- Redacting logger + Zod env config; contracts package with RFC 9457 ProblemDetails + openapi.json snapshot test; i18n catalog; web import guards (db/auth-server imports fail lint) + supervisor allowlist test.
- Fixed during review: db barrel lint errors; teardown race (worker test never stopped its queue; helper now terminates backends before shutdown).
- Verification: lint/typecheck 19+ green, tests 20/20 tasks green (db-seam 12/12).

Branch: `ticket/01-monorepo-foundation` @ `5934c9e`, merged fast-forward into `m0-walking-skeleton`.
