# myform

Form platform — monorepo (pnpm + Turborepo): Next.js web, NestJS API, worker, and shared packages. Spec: `spec.md` (repo root). Deploy: `docs/runbooks/alpha-deploy.md`.

## Agent skills

### Issue tracker

Issues live as local markdown files, one per ticket, at `issues/NN-slug.md` in this repo (the M0 spec is `spec.md` at the root). Tickets carry a `**Status:**` line and a `Blocked by:` line; conversation history appends under `## Comments`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: root `GLOSSARY.md` + `docs/adr/`, consumed per the rules in `docs/agents/domain.md`.
