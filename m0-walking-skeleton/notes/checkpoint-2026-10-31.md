# M0 build checkpoint — 2026-10-31

The `/implement-spec` run for the M0 walking skeleton was paused here at the user's request.
Resume by reading this file plus `notes/local-env.md`, then continuing the orchestration loop described below.

## Where the work lives

- **Spec:** `.scratch/m0-walking-skeleton/spec.md`
- **Tickets (task graph):** `.scratch/m0-walking-skeleton/issues/01..12-*.md`, each with a `Blocked by:` line
- **Environment notes (verified facts):** `notes/local-env.md` — no Docker/no sudo; embedded-postgres + Mailpit substitutes; Playwright Chromium verified; pnpm store-dir on /media/ben/my

## Git layout

- `main` — meta commits only (initial commit, this checkpoint)
- `m0-walking-skeleton` — **integration branch** (all ticket branches merge into it; nothing has merged yet)
- Ticket branches, one worktree each under `/media/ben/my/fp-wt/`:
  - `fp-wt/01-foundation` → `ticket/01-monorepo-foundation`
  - `fp-wt/02-spike` → `ticket/02-alpha-topology-spike`
  - `fp-wt/03-auth-core` → `ticket/03-auth-core`

At pause time all three implementer agents were mid-ticket and committed WIP to their branches before stopping. Their final status messages (recorded below) say exactly where each ticket stands. **Do not restart a ticket from scratch — read the branch log and continue from it.**

### Status at pause (confirmed by each agent; branches are the source of truth)

**Ticket 01** — `ticket/01-monorepo-foundation` @ `c50a747` (tree clean).
Done: pnpm+Turborepo scaffold (9 package manifests + 3 app manifests, deps installed, embedded-postgres pinned per notes), sources + tests WRITTEN but NOT executed for packages config (Zod env loader, redacting logger, supervisor child-env allowlist), contracts (problem codes, RFC 9457, OpenAPI builder), form-schema (envelope/blocks/limits/migrateSchema stub), logic stub, i18n.
Resume from: verify embedded-postgres hydration (`pnpm rebuild @embedded-postgres/linux-x64` completed; needs one confirmation), run config/contracts/i18n tests, then build packages db (bootstrap, migrator, migrations incl. pgboss DDL, transaction wrapper, test helper, DB seam tests) and queue (port + pg-boss adapter), ui package, apps api/web/worker (health, ProblemDetails filter, openapi.json, rewrite, import guards), scripts/dev-env + dev orchestrator, docs/ADRs/.env.example, CI workflow, final green run + merge `m0-walking-skeleton`.

**Ticket 02** — `ticket/02-alpha-topology-spike` @ `da824a8` (tree clean, 4 commits; self-contained harness in `spike/`, installed).
Done: from pinned package source (no runtime yet): pg-boss 12.38.0 `migrate: false` skips its own DDL and `getConstructionPlans("pgboss")` exports the install DDL for the migrator; interval knobs recorded (2s polling / 60s supervise / cron timekeeper 5s max 45s) — basis for the "don't keep Neon awake" decision (`schedule: false` + Node-side ~10-min dispatch timer).
Not yet verified (suites WRITTEN, nothing executed): RLS/fn_owner proofs, pg-boss runtime send/work/schedule, pooled context-leak test, supervisor env allowlist, Next `/v1/*` rewrite + cookie round-trip, Better Auth in NestJS (user-ID decision still OPEN), proxy-header chain.
Resume from: `pnpm test` in `spike/` (rls + pgboss + pooled suites), fix fallout, then Next/Nest topology harness + topology test, then `docs/adr/*`, decision table, CI workflow. Open question for 03: user-ID representation ADR.

**Ticket 03** — `ticket/03-auth-core` @ `0e13f30` (tree clean, 2 commits).
Done (Phase A, TDD-written, tests not yet executed): i18n auth catalog + translator; `GET /v1/auth/session` contract in packages/contracts + registered in OpenAPI; `origin_mismatch` stable problem code. NOTE: commit `833c7f7` MIRRORED 01's scaffold instead of merging it — the next `git merge ticket/01-monorepo-foundation` should be run early on resume and any mirror/real conflicts resolved in favor of 01's canonical scaffold.
Remaining Phase A: run i18n/contracts tests; Origin guard with cookie-less allowlist; email adapter (Mailpit + HTTPS seam); dashboard shell/middleware/sign-in pages.
Remaining Phase B (needs 02's ADRs): Better Auth wiring per recorded config, session endpoint impl, enumeration-safe flows, unverified-403 helper, integration + browser tests.

**Tickets 04–12:** not started.

## Orchestration conventions (keep using these on resume)

1. **One implementer subagent per ticket**, fresh context, in its own worktree. Launch prompt pattern: working setup (worktree path + branch + sibling-merge rules) → required reading (ticket file, `notes/local-env.md`, spec sections) → Skill(`tdd`) → build order → completion checklist (every checkbox met or user-pending; merge `m0-walking-skeleton` + parent branches; full lint/typecheck/test green; report ≤40 lines). Run them in the background.
2. **Pipelining:** a ticket may start stacked on its parent's branch while the parent is still running, IF the child's early work is independent of the parent's undecided outcomes. The child merges moving parent branches (`git merge ticket/NN-*`) repeatedly and keeps its files disjoint where possible. 02 was stacked on 01 (isolated `spike/` sandbox); 03 was stacked on 01+02 (Phase A decision-independent → Phase B polls 02's ADRs at `/media/ben/my/fp-wt/02-spike/docs/adr/`).
3. **Merger:** after an implementer reports done, merge its branch into `m0-walking-skeleton` (fast-forward when linear; use a merger subagent on real conflicts), then launch the new frontier immediately.
4. **Agents never edit `.scratch/` or `.agents/`;** the orchestrator owns ticket-file status updates and any tracker resolution.
5. **Do not re-verify what is already verified:** the Docker substitutes, Playwright, pnpm store are proven and documented in `notes/local-env.md`.

## Remaining graph (after 01–03 land)

- 03 done → launch **04 ∥ 05 in parallel** (two worktrees)
- 05 done → 06 → 07 → 08 → 09 (serial)
- 09 + 04 done → 10 → 11 → 12
- After all tickets: run the `code-review` skill on `m0-walking-skeleton`, fix findings with one fresh implementer, resolve tickets in the tracker (flip `Status:` lines), then delete the ticket worktrees.

## User-pending items (cannot be done by agents — no credentials)

Collected as agents reported them; verify against final ticket comments:

- Neon project + its admin/pooled/direct connection strings (spike re-verification of pooled behavior, admin bootstrap on real Neon, migrations in CI)
- Render service + deploy-hook URL (single-service alpha deploy; auto-deploy disabled)
- GitHub Actions secrets (migrator URL etc.) and a GitHub remote to run CI against
- Email provider account + verified sending domain (~$10/yr; `onrender.com` cannot be verified) — needed before the first outside tester
- Ticket 12's live smoke test needs all of the above
