# ADR-0003: pg-boss schema DDL is installed by the migrator, not by pg-boss

**Status:** Accepted (M0)

## Context

pg-boss normally creates its own schema at first start. That conflicts with the role model: DDL belongs to the `migrator` role, while runtime roles (`app_user`, `worker_user`) get DML only, and `fn_owner` owns security-definer functions.

## Decision

pg-boss 12.x is constructed with `migrate: false` so it never installs its own DDL. The migrator calls `getConstructionPlans("pgboss")` and executes the returned install DDL as `migrator` (migration `0001_pgboss.migrate.cjs`). Runtime roles receive DML grants on `pgboss.*` tables only.

## Consequences

- Schema ownership stays with the migrator; no runtime role can alter the queue schema.
- pg-boss version upgrades require regenerating the install DDL migration; pinned version in `packages/queue`.
- The spike (ticket 02) proved this pattern against the pinned pg-boss version; the db-seam tests assert `app_user`/`worker_user` cannot touch `pgboss` DDL.
