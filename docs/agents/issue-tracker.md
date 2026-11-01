# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in this repository.

## Conventions

- The feature spec is `spec.md` at the repo root
- Implementation issues are one file per ticket at `issues/NN-<slug>.md`, numbered from `01`, never a single combined tickets file
- Each ticket carries a `**Status:**` line near the top (see `triage-labels.md` for the role strings) and a `**Blocked by:**` line listing its dependency ticket numbers — a ticket is unblocked when every blocker is `done`
- Comments and conversation history append to the bottom of the file under a `## Comments` heading
- Deploy/operations knowledge lives in `docs/runbooks/` (the alpha deploy runbook is `docs/runbooks/alpha-deploy.md`)

## When a skill says "publish to the issue tracker"

Create a new file at `issues/NN-<slug>.md` (next free number).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `spec.md` plus a tracking issue file when needed (the Notes / Decisions-so-far / Fog body).
- **Child ticket**: `issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `issues/` for files that are open, unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far.
