# myform

Form platform — monorepo (pnpm + Turborepo): Next.js web, NestJS API, worker, and shared packages (config, logger, contracts, form-schema, i18n, db, queue, ui, auth, logic).

## Quickstart

```bash
pnpm install
pnpm dev          # one command: starts web + API + worker (boots embedded Postgres + Mailpit, runs admin bootstrap + migrations when needed)
```

- Web: http://localhost:3000 (proxies `/v1/*` to the internal API)
- API: internal port, `GET /v1/health`, `GET /v1/openapi.json`
- Worker: logs a heartbeat on an interval

## Local environment

```bash
pnpm local:up      # start long-running embedded Postgres + Mailpit
pnpm local:status
pnpm local:down
```

No Docker required (see `docs/adr/0002-embedded-postgres-substitute.md`). Copy `.env.example` to `.env` for explicit credentials; `pnpm dev` generates a working one when missing.

## Database

```bash
pnpm db:bootstrap   # one-time admin bootstrap: schemas app/auth/pgboss + roles migrator/app_user/worker_user/fn_owner
pnpm db:migrate     # run migrations as migrator (includes pg-boss DDL install)
```

## Verify

```bash
pnpm lint && pnpm typecheck && pnpm test
```

CI runs the same three gates on every push and PR (`.github/workflows/ci.yml`).
