# Runbook — Alpha deploy (Neon + Render + GitHub Actions) + pending-user checklist

> **Authoritative runbook for ticket 12** (supersedes `docs/RUNBOOK-deploy.md`,
> which is now a redirect stub). Order is load-bearing; execute the phases
> strictly top-to-bottom. Steps marked **[PENDING-USER]** need real
> Neon/Render/GitHub/email-provider credentials and cannot be executed by an
> agent (orchestration protocol: everything verifiable locally is implemented
> and green; external steps are recorded verbatim here and in
> [issues/12-deploy-smoke.md](../../issues/12-deploy-smoke.md)).
> Everything else is verified working on this branch.

---

## 0. Gate: the local smoke must pass BEFORE any deploy

The final deployment milestone is a smoke test, not the first deploy.

```sh
pnpm install && pnpm smoke:alpha
```

`scripts/smoke-alpha.mjs` boots the whole walking skeleton through
`scripts/supervisor.mjs --dev` (embedded Postgres :5433 → one-time admin
bootstrap → migrations → Better-Auth `auth`-schema DDL → pg-boss schema
install → mail sink → API → worker → web) and drives 12 HTTP steps through the
real browser → Next.js `/v1/*` rewrite → NestJS hop. **Verified on this branch
(2026-11-01): PASS 12/12, ~14 s** (first run adds the one-time turbo build).
CI runs the same script on every push to `main`/`integration/m0` (job
`smoke-local` in `.github/workflows/deploy.yml`). If it is red, stop — do not
deploy.

---

## The ordered deploy pipeline

```
 one-time (human, ~15 min)        every deploy (push to main)
 ─────────────────────────        ────────────────────────────────────────────
 Phase 1  Neon project +          push main
          admin bootstrap    ─►   GitHub Actions `migrate` job
                                      │  (migrator URL = GitHub secret ONLY)
                                      ▼
                                  GitHub Actions `deploy` job (needs: migrate)
                                      │  POST deploy hook
                                      ▼
                                  Render build + `supervisor --serve`
                                      │  (auto-deploy OFF; no pre-deploy cmd)
                                      ▼
                                  Phase 5  live smoke on the alpha URL
```

Non-negotiables (spec "Deployment and configuration"; ADR 0003):

1. **Migrations run first, code ships second.** New code must never start
   before the schema exists.
2. **Render auto-deploy on push is DISABLED** (dashboard: Settings → Build &
   Deploy → Auto-Deploy: off). Deploys happen only via the deploy hook.
3. **Render free has no pre-deploy migration command** — migrations never run
   as a Render step; GitHub Actions migrate-before-deploy is the primary path.
4. **The migrator URL exists ONLY as a GitHub Actions secret.** It never
   appears in Render's runtime environment (any `*MIGRATOR*`/`*ADMIN*`/
   `*DATABASE_URL*`-style key reaching the web child aborts the boot —
   fail-closed check in `scripts/supervisor.mjs`, tested by
   `packages/config/test/supervisor.test.mjs`, 11/11 green).
5. Role separation at runtime: app → `app_user` (pooled URL), worker →
   `worker_user` (direct URL), functions → owned by NOLOGIN `fn_owner`,
   nobody has `BYPASSRLS`. Role passwords live only in env vars, never in
   migration files.

---

## Phase 1 — Neon project + one-time admin bootstrap [PENDING-USER]

**Who:** repo owner. **Where:** Neon console + a local terminal that can
reach Neon. **Time:** one-time; never part of migrations or the deploy
pipeline.

1. Create the Neon project (free tier is fine for the alpha). Copy BOTH
   connection strings from the Neon dashboard: the **pooled** URL
   (`...-pooler.../neondb?sslmode=require`, used by the app) and the **direct**
   URL (used by the migrator and pg-boss — transaction-mode pooling breaks
   session-scoped features such as advisory locks, ADR 0003).
2. Invent three role passwords (min 8 chars each; store them in the owner's
   password manager — they are env vars only and never appear in migration
   files).
3. Run the one-time admin bootstrap from a machine that can reach Neon, with
   the Neon **project-owner connection as `ADMIN_DATABASE_URL`** and the
   passwords as env vars (the CLI is `packages/database/src/cli/bootstrap.ts`
   via `pnpm db:bootstrap`; schema: `packages/config/src/env.ts`
   `bootstrapEnvSchema`):

   ```sh
   ADMIN_DATABASE_URL="postgres://<owner>:<pw>@<neon-host>/<db>?sslmode=require" \
   MIGRATOR_PASSWORD="…" \
   APP_USER_PASSWORD="…" \
   WORKER_PASSWORD="…" \
   pnpm db:bootstrap
   ```

4. **Expected output** (exit 0): a summary listing
   `Roles created: migrator, app_user, worker_user, fn_owner`, the schemas
   `app, auth, pgboss`, and `fn_owner granted to migrator (WITH ADMIN OPTION): yes`.
   The bootstrap creates exactly that shape: schemas `app`/`auth`/`pgboss`;
   roles `migrator`, `app_user`, `worker_user`; **NOLOGIN `fn_owner`**; **no
   runtime role has `BYPASSRLS`** (Neon owners/superusers do — use the
   least-privilege URLs everywhere below, never the owner connection at
   runtime).
5. Sanity-check (optional but cheap): connect as `app_user` → `CREATE TABLE`
   fails (no DDL); connect as `migrator` → cannot SELECT tenant rows. The
   database package's RLS/catalog tests prove the shape on real PG 17.

## Phase 2 — GitHub Actions migration job [PENDING-USER]

**Who:** repo owner. **Where:** GitHub → repository → Settings → Secrets and
variables → Actions.

| Secret                   | Value                                                                                                        | Lives ONLY in                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| `MIGRATOR_DATABASE_URL`  | **Direct** (non-pooled) Neon URL for the `migrator` role — NOT the `...-pooler...` URL, no `?pgbouncer=true` | GitHub Actions — never Render, never a migration file |
| `RENDER_DEPLOY_HOOK_URL` | Deploy-hook URL of the Render service (Render → Settings → Deploy Hooks; created in Phase 3)                 | GitHub Actions                                        |

Steps:

1. Create the Render service FIRST if the hook URL does not exist yet
   (Phase 3, step 1) — the hook is just a URL, safe to store before first use.
2. Set both secrets in GitHub Actions.
3. Trigger `.github/workflows/deploy.yml` once via **Run workflow**
   (`workflow_dispatch`) on `main` and watch the `migrate` job run
   `pnpm db:migrate` with `MIGRATOR_DATABASE_URL` from the secret
   (`packages/database/src/cli/migrate.ts`). Expected: `Migrations applied: …`
   (first run) or `Already applied: N` (idempotent re-runs).
4. The `deploy` job is `needs: migrate` — if migrations fail, the Render hook
   is never fired. Verify both jobs go green.

**Workflow review verdict (agent, 2026-11-01):**
`.github/workflows/deploy.yml` already implements the correct
migration-then-deploy chain — `migrate` (main-only) applies migrations with
`MIGRATOR_DATABASE_URL` as an Actions-only env; `deploy` is `needs: migrate`
and only POSTs `RENDER_DEPLOY_HOOK_URL`; `smoke-local` runs
`scripts/smoke-alpha.mjs` on `main` + `integration/m0`. **No migrator URL or
database credential is exposed to Render by the workflow, so
`docs/runbooks/deploy-alpha.yml.example` is NOT needed.** The
`.github/workflows/` tree is frozen for this ticket (owned elsewhere);
re-review it if the file changes.

## Phase 3 — Render web service [PENDING-USER]

**Who:** repo owner. **Where:** Render dashboard → New → Web Service → point
it at the repo (`main`).

| Setting       | Value                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------- |
| Build command | `pnpm install --frozen-lockfile && pnpm build`                                              |
| Start command | `node scripts/supervisor.mjs --serve`                                                       |
| Auto-Deploy   | **OFF** — deploys happen only via the hook (non-negotiable, see pipeline non-negotiable #2) |
| Instance type | Free (single service spins down when idle)                                                  |

`--serve` spawns the built `next start`, the NestJS API (`tsx src/main.ts`),
and the inline worker (`tsx src/index.ts`) with the same per-child
allowlists as dev mode (web = `PORT, APP_ORIGIN, API_INTERNAL_URL,
API_INTERNAL_PORT, LOG_LEVEL, NEXT_TELEMETRY_DISABLED, NEXT_PUBLIC_*` only).
Set ONLY these Render env vars — everything else is dropped by the allowlist,
and a forbidden key reaching the web child aborts the boot:

| Render env var        | Reaches child | Meaning                                                                         |
| --------------------- | ------------- | ------------------------------------------------------------------------------- |
| `DATABASE_URL`        | api           | **Pooled** Neon URL as `app_user` (request path)                                |
| `WORKER_DATABASE_URL` | worker        | **Direct** Neon URL as `worker_user` (pg-boss needs session-scoped features)    |
| `BETTER_AUTH_SECRET`  | api only      | Auth secret (min 16 chars) — never the web child                                |
| `APP_ORIGIN`          | web + api     | The public origin, e.g. `https://form-alpha.onrender.com` (Origin check)        |
| `EMAIL_PROVIDER`      | api only      | `resend` (unconfigured → sends fail loudly, no tokens in logs)                  |
| `RESEND_API_KEY`      | api only      | Email provider API key — server-side only                                       |
| `EMAIL_FROM`          | api only      | Sender on the VERIFIED domain, e.g. `Form <noreply@your-domain.com>`            |
| `TRUSTED_PROXY_COUNT` | api only      | `1` behind the Render platform edge (ADR 0004)                                  |
| `IP_HASH_SECRET`      | api only      | HMAC key for stored `ip_hash` (min 16 chars; derived from auth secret if unset) |
| `FORM_SUBMISSION_CAP` | api only      | Per-form submission cap (default 1000)                                          |
| `LOG_LEVEL`           | all children  | `info` in production                                                            |

`PORT` is injected by Render and honored by the supervisor; the API listens on
`API_PORT` (default 4000) on localhost only. **Do NOT set
`MIGRATOR_DATABASE_URL`, `ADMIN_DATABASE_URL`, or any role password in
Render** — the migrator URL exists only as a GitHub Actions secret (Phase 2).

## Phase 4 — Deployed email adapter + sending-domain verification [PENDING-USER]

**Who:** repo owner. **Where:** email-provider console (Resend or equivalent)

- DNS. The deployed adapter is `packages/auth/src/server/email/resend.ts` —
  pure HTTPS `fetch` (works on Render free; no SMTP port needed), fails loudly
  without a key, and never logs the message body (which carries verification /
  reset links).

1. Create the provider account + API key → value into Render env
   `RESEND_API_KEY` (Phase 3). Set `EMAIL_PROVIDER=resend` and an
   `EMAIL_FROM` address.
2. **Sandbox expectation:** until a domain is verified, the provider may
   deliver ONLY to the account owner's address. Verify the real-email path
   with the owner's address: sign up on the alpha → the verification email
   arrives in the owner's inbox → the link redeems → sign-in works. **No
   verification token may appear in the Render logs** (scan once).
3. Complete one password reset over the live email path (single-use token,
   one-hour expiry, all sessions revoked on completion).
4. **Before the first OUTSIDE tester:** own and verify a sending domain with
   the provider — buy a domain (roughly $10/year; confirm current pricing),
   add the provider's DNS records (SPF/DKIM), wait for the console to show
   verified, then point `EMAIL_FROM` at that domain. **`onrender.com` cannot
   be verified as a sender domain** — without this, outside testers never
   receive mail.

## Phase 5 — Smoke the alpha (the milestone itself)

Automated part = Phase 0 (`pnpm smoke:alpha` green locally and in CI) plus
`smoke-local` in CI on every push. The **live** part below is manual
[real email + deployed origin], run after every deploy:

- [ ] `curl -s https://<alpha>/v1/health` → `{"status":"ok","db":"ok"}` — no
      tenant data in the body.
- [ ] Live loop: sign up (owner's address until the domain is verified, then
      an outside tester's) → verify via the REAL email → bootstrap workspace →
      create form → save draft (valid blocks) → publish → open `/f/{slug}` in
      a private window → submit unauthenticated → see the submission in the
      dashboard inbox.
- [ ] Unpublish → closed message publicly; republish → link works again at a
      new version number.
- [ ] Ticket-04 hardening in the deployed build: cookie-less mutation → 403
      `origin_mismatch`; hammering sign-up → 429 `rate_limited` with
      `Retry-After`.
- [ ] Supervisor allowlist on the deployed build: Next process env contains
      no `DATABASE_URL`, auth secret, or migrator URL (CI-proven by
      `packages/config/test/supervisor.test.mjs`; live spot-check via the
      Render shell `env | sort` inside the web child if desired).
- [ ] Log scan (first deploy): no signed-up address, form title, submission
      answer, cookie, token, or authorization header anywhere in Render logs.
- [ ] Cold-start numbers recorded (see "Cold-start behavior" below).

---

## Pending-user checklist (the exact external steps, in order)

Nothing here can be executed by an agent. Who / where / what value goes where:

| #   | Step [PENDING-USER]                                                                                                                                                                                                                                                                           | Where the value goes                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| P1  | Create the **Neon project**; copy the **pooled** and **direct** connection strings; invent 3 role passwords (password manager)                                                                                                                                                                | Pooled → P6 `DATABASE_URL`; direct → P2, P6 `WORKER_DATABASE_URL` |
| P2  | Run the one-time **admin bootstrap** (`pnpm db:bootstrap`) with the Neon owner connection as `ADMIN_DATABASE_URL` + `MIGRATOR_PASSWORD`/`APP_USER_PASSWORD`/`WORKER_PASSWORD`; expect `migrator, app_user, worker_user, NOLOGIN fn_owner`, no BYPASSRLS                                       | Passwords stay in the password manager; nothing else stores them  |
| P3  | Create the **Render web service** (`pnpm install --frozen-lockfile && pnpm build` / `node scripts/supervisor.mjs --serve`, **Auto-Deploy OFF**); copy the **deploy-hook URL**                                                                                                                 | Hook URL → P4                                                     |
| P4  | Set GitHub Actions secrets `MIGRATOR_DATABASE_URL` (**direct** migrator URL) and `RENDER_DEPLOY_HOOK_URL`                                                                                                                                                                                     | GitHub Actions ONLY — never Render                                |
| P5  | Run `deploy.yml` once via `workflow_dispatch`; watch **migrate** apply the schema, then **deploy** fire the hook                                                                                                                                                                              | — (verification step)                                             |
| P6  | Set the Render env vars of Phase 3 (`DATABASE_URL` pooled app_user, `WORKER_DATABASE_URL` direct worker_user, `BETTER_AUTH_SECRET`, `APP_ORIGIN`, `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM`, `TRUSTED_PROXY_COUNT=1`, `LOG_LEVEL=info`). **No migrator URL anywhere in Render** | Render service env                                                |
| P7  | Email provider: account + API key; send the verification email to the OWNER address and confirm the live path + one password reset; scan logs for tokens                                                                                                                                      | `RESEND_API_KEY` → Render; token appears only in mail             |
| P8  | **Verify a sending domain** with the provider (buy domain ~$10/yr — confirm pricing; add SPF/DKIM; verify) BEFORE the first outside tester; `onrender.com` cannot be a sender domain                                                                                                          | Verified domain → `EMAIL_FROM` in Render                          |
| P9  | Run the Phase-5 live smoke on the alpha URL; record cold-start numbers in the ticket                                                                                                                                                                                                          | Ticket 12 checklist (last two open boxes)                         |

---

## Smoke-test mapping — what proves which ticket-12 checkbox

Ticket 12 checkboxes (see `issues/12-deploy-smoke.md`) and their evidence:

| Ticket-12 checkbox (abridged)                                                                                                        | Proven by                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Admin bootstrap ran on Neon; schemas + 4 roles; no password in migrations; migrator password absent from Render                   | Bootstrap script (`pnpm db:bootstrap`) output on Neon = **P2** (user); no-password-in-migrations proven by `packages/database` migration-suite + catalog tests; migrator-URL-not-in-Render proven by the supervisor allowlist tests (11/11) |
| 2. GH Actions migrated before Render deploy; auto-deploy disabled; migrator URL only in Actions; app_user/worker_user/fn_owner split | `deploy.yml` `migrate` → `deploy` (`needs`) chain + Phase-2/3 dashboard settings = **P4/P5/P3** (user); role split proven by db/queue test suites (RLS, fn_owner, worker_user DML-only)                                                     |
| 3. HTTPS email adapter works without Mailpit (sandbox → owner's address)                                                             | Smoke steps 3–4 prove the adapter seam end-to-end against the local sink; the LIVE email proof is **P7** (user) — same `EmailProvider` port, `EMAIL_PROVIDER=resend`                                                                        |
| 4. Sending domain owned + verified before first outside tester; `onrender.com` can't be verified                                     | **P8** only (user, external) — checklist above; adapter + `EMAIL_FROM` wiring is code-complete (`resend.ts`)                                                                                                                                |
| 5. Live signup → create → publish → submit → review on the alpha                                                                     | Smoke steps 2, 5–12 prove the full loop locally (12/12 green); the LIVE run is **P9** (user) after P7                                                                                                                                       |
| 6. Cold-start measured, incl. the authenticated SSR session hop                                                                      | Measurement procedure below; numbers = **P9** (user) — needs the live URL                                                                                                                                                                   |
| 7. Supervisor allowlist; Next env has no `DATABASE_URL`/auth secret/migrator URL                                                     | `packages/config/test/supervisor.test.mjs` (11/11) + the fail-closed spawn check in `scripts/supervisor.mjs` — no user step needed                                                                                                          |
| 8. Health endpoint correct; logs contain no tenant data or secrets                                                                   | Smoke step 1 (body shape) + redaction tests in `packages/config` + `apps/api`; live log scan inside **P9**                                                                                                                                  |
| 9. Ticket-04 auth hardening present in the deployed build                                                                            | api suite (198/198) covers origin guard + rate limits; live spot-checks listed in Phase 5                                                                                                                                                   |

---

## Cold-start behavior (spec notes for the alpha)

The spec: measure, don't guess; the free-tier limitations are disposable and
must NOT be encoded into domain code, the RLS model, or the session design.

- **Render free spins the service down when idle**; the first request pays
  process spin-up (supervisor → next start + NestJS + worker). Expected and
  acceptable.
- **Neon free suspends its compute after ~5 min of inactivity**; a cold
  request additionally pays the Neon wake.
- **While the service is up, the worker keeps Neon awake — by design
  (ADR 0003 trade-off).** The implemented dispatch strategy is a recurring
  pg-boss schedule for `outbox.dispatch` (+ heartbeat) at
  `HEARTBEAT_INTERVAL_MS` (default 30 s; pg-boss 12's 60 s throttle slot
  degrades it to ~1 dispatch tick/minute), and the pg-boss cron monitor polls
  every 5 s (`cronMonitorIntervalSeconds: 5`), so a running worker keeps the
  Neon compute awake regardless of the dispatch interval. This buys bounded
  dispatch latency (~≤1 min) over idle savings.
- **"Don't keep Neon awake" levers** (spec: dispatch must use the interval or
  strategy from the topology spike "so it does not keep Neon awake"; ADR 0003
  records the alternative): widen `HEARTBEAT_INTERVAL_MS` beyond the Neon
  suspend threshold — e.g. `600000` (10 min, emitted as
  `FREQ=SECONDLY;INTERVAL=600`) — or drop the recurring schedule entirely
  (schedule-less / "schedule: false") and rely on producers enqueuing
  `outbox.dispatch` directly right after committing events, with the schedule
  kept only as a safety net (ADR 0005 documents the direct-enqueue path). A
  schedule-less shape with a Node-side ~10-min timer is the spec-compliant
  idle option; on Render free the practical reality is that the service spins
  down when idle anyway, which is the only state where Neon actually gets to
  sleep. Ticket 05 re-decides with real dispatch traffic; do not change
  domain code for this.
- **Measure (Phase 5 / P9), record in the ticket:**
  1. `time curl -s -o /dev/null -w "%{http_code} %{time_total}\n" https://<alpha>/v1/health`
     — run twice: first = cold (spin-up + Neon wake), second = warm.
  2. Same against `https://<alpha>/f/<slug>` — the unauthenticated SSR page
     (Next → internal API hop).
  3. Sign in and load `https://<alpha>/dashboard` — the **authenticated SSR
     session hop** (Next server component → internal API with the forwarded
     cookie); read the browser network waterfall.

---

## Appendix — copy-paste command block (phases 1–5)

```sh
# Phase 1 — one-time admin bootstrap against Neon (owner connection)
ADMIN_DATABASE_URL="postgres://<owner>:<pw>@<neon-host>/<db>?sslmode=require" \
MIGRATOR_PASSWORD="…" APP_USER_PASSWORD="…" WORKER_PASSWORD="…" \
pnpm db:bootstrap
# expect: Roles created: migrator, app_user, worker_user, fn_owner
#         Schemas: app, auth, pgboss · fn_owner granted to migrator: yes

# Phase 0/5 — the smoke (local gate before AND after touching the pipeline)
pnpm smoke:alpha            # SKIP_BUILD=1 pnpm smoke:alpha on a built tree
# expect: === smoke-alpha PASS — 12/12 steps ===

# Phase 2 — migrations are exactly what CI runs (dry-proof the secret locally)
MIGRATOR_DATABASE_URL="postgres://migrator:<pw>@<neon-direct-host>/<db>?sslmode=require" pnpm db:migrate

# Phase 5 — cold-start probes on the live alpha
time curl -s -o /dev/null -w "%{http_code} %{time_total}\n" https://<alpha>/v1/health
time curl -s -o /dev/null -w "%{http_code} %{time_total}\n" https://<alpha>/f/<slug>
```

Secret ledger (one line each): `MIGRATOR_DATABASE_URL` → GitHub Actions only;
`RENDER_DEPLOY_HOOK_URL` → GitHub Actions only; `DATABASE_URL` (pooled
app_user), `WORKER_DATABASE_URL` (direct worker_user), `BETTER_AUTH_SECRET`,
`RESEND_API_KEY`, `EMAIL_FROM`, `APP_ORIGIN`, `TRUSTED_PROXY_COUNT`,
`IP_HASH_SECRET`, `FORM_SUBMISSION_CAP`, `LOG_LEVEL` → Render env only; the
three role passwords → the owner's password manager, passed as env vars to the
one-time bootstrap. Nothing secret lives in a migration file, the repo, or the
web child's environment.
