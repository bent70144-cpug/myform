# ADR-0001: Single-service alpha topology behind a supervisor

**Status:** Accepted (M0)

## Context

M0 runs one alpha deployment. The web (Next.js) tier is publicly reachable; the API (NestJS), the worker, and Postgres must not be. Real network-level separation arrives with the beta split.

## Decision

A supervisor process starts Next.js on the public port, NestJS on an internal-only port, and the inline worker locally. Each child receives an explicitly allowlisted environment: the Next process gets only public variables and the internal API URL — never `DATABASE_URL`, auth secrets, or the migrator URL. A test fails the build if a forbidden key appears in the web child environment.

## Consequences

- Process-level separation only; a compromised web process still shares the host.
- The allowlist lives in `packages/config` and is shared by the production supervisor (`scripts/supervisor.mjs`) and the dev orchestrator (`scripts/dev.mjs`), so dev and prod cannot drift.
- The beta split replaces the supervisor's children with separately deployed services; the port/rewrite seam (`/v1/*`) stays.
