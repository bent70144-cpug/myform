# Web App Design System

Audience: engineers working in `apps/web`. Source of truth:
`apps/web/src/lib/ui-tokens.ts` (tokens) and `apps/web/src/lib/ui.tsx`
(components). This document describes what is in those files — nothing here
invents tokens that do not exist in code.

## 1. Purpose & principles

- **No CSS framework.** The spec's visual language is slate ink on white with
  hairline borders, soft gray surfaces, and `system-ui` type. Every component
  styles itself through **inline styles** (`React.CSSProperties` objects).
  Inline styles cannot express pseudo-classes or keyframes, so there is
  exactly ONE global stylesheet: the `GLOBAL_CSS` string in
  `app/layout.tsx` (box-sizing reset, the `:focus-visible` ring, and the
  `uiPulse` keyframes used by `PulseDot`).
- **Two modules, one import path.** `lib/ui-tokens.ts` holds pure style
  tokens (no JSX, no React runtime beyond the `CSSProperties` type import).
  `lib/ui.tsx` holds the component kit and re-exports everything from
  `./ui-tokens`, so most pages import only from `lib/ui` (relative import,
  e.g. `import { Alert, btn } from "../../lib/ui"`).
- **All strings via `@form/i18n`.** No hardcoded UI copy — component kit and
  page metadata pull from the catalog (`t("common.appName")`,
  `en.common.appName`).
- **Layout is framework-free baseline:** `body` gets `system-ui, sans-serif`,
  color `#1f2937`, background `#ffffff`, and a full-height flex column with
  `#main { flex: 1 }`.

## 2. `ui-tokens` vs `ui` — the split and WHY

| Module | Contents | Imports | Safe for |
|---|---|---|---|
| `lib/ui-tokens.ts` | style objects + `btn()`/`alertStyle()`/`stack()` helpers | only `react` type (`CSSProperties`) | every compiler pipeline |
| `lib/ui.tsx` | components (`Alert`, `Badge`, `Field`, …) + re-export of tokens | `next/link`, `@form/i18n`, React | server AND client components |

**Why the split matters:** the public-form files under
`apps/web/src/app/f/[slug]/` are rendered by vitest tests using the
esbuild classic-JSX transform. Those tests **must not transitively import
`next/link`**, which `lib/ui.tsx` does (for the brand links in `AppNav` and
`AuthShell`). Therefore:

- Dashboard/auth pages → import from `lib/ui`.
- `app/f/[slug]/*` (`PublicFormView`, `PublicFormClient`, …) → import from
  `lib/ui-tokens` **directly** (e.g. `import { C, input, softCard } from
  "../../../lib/ui-tokens"`). Do not "fix" these to import `lib/ui`.

**Server/client safety:** `lib/ui.tsx` deliberately contains no hooks and no
event wiring, so every component in it renders identically as a server
component or inside a client component. If you add state or handlers, put
them in a separate client file — keep `lib/ui` hook-free.

Other enforced boundaries (see `apps/web/scripts/check-imports.mjs` + ESLint
`no-restricted-imports`): the web app never imports `@form/database` or
`@form/auth/server`.

## 3. Color tokens (`C`)

All colors are literals on the exported `C` object. Contrast ratios are
approximate, computed against the background each token is actually paired
with in the kit.

| Token | Hex | Intended use | Contrast notes |
|---|---|---|---|
| `ink` | `#1f2937` | Primary text (headings, body, labels); primary button background; `info` alert fg; link color | ≈14.7:1 on white (AAA); ≈14.0:1 on `soft`. White text on `ink` (primary button) ≈14.7:1 |
| `muted` | `#555555` | Secondary text: paragraphs, hints, ghost-button fg, `Badge` neutral fg, `PulseDot` | ≈7.4:1 on white; ≈7.1:1 on `soft` — AA/AAA everywhere used |
| `faint` | `#8a8f98` | Faintest text tier (currently defined but unused in app source) | ≈3.2:1 on white — **fails AA (4.5:1) for body copy**; large text / decorative only |
| `border` | `#e5e7eb` | Hairline borders: cards, `AppNav` underline, `Divider`, info alert border | non-text UI; fine |
| `borderStrong` | `#d1d5db` | Stronger borders: inputs, secondary button | non-text UI |
| `soft` | `#f9fafb` | Soft gray surface: `softCard`, `AuthShell` background, info alert bg, neutral badge bg | surface only; ink/muted text on it stay ≥7:1 |
| `white` | `#ffffff` | Card/button/input backgrounds; primary button text | base surface |
| `danger` | `#b00020` | Error fg; danger-button fg | ≈7.3:1 on white; ≈6.7:1 on `dangerBg` (AA) |
| `dangerBg` | `#fdf2f3` | Error alert/badge background | pairs with `dangerBorder` |
| `dangerBorder` | `#f0c4ca` | Error alert/badge/danger-button border | — |
| `success` | `#0a7d32` | Success fg | ≈5.3:1 on white; ≈4.9:1 on `successBg` (AA — close to the 4.5 floor, keep the pairing) |
| `successBg` | `#f0faf2` | Success alert/badge background | pairs with `successBorder` |
| `successBorder` | `#c9ead2` | Success alert/badge border | — |
| `warning` | `#7c4a03` | Warning fg | ≈7.4:1 on white; ≈6.9:1 on `warningBg` (AA) |
| `warningBg` | `#fdf6e3` | Warning alert/badge background | pairs with `warningBorder` |
| `warningBorder` | `#eedfb2` | Warning alert/badge border | — |
| `info` | `#1f2937` (= `ink`) | Info alert fg | same as `ink` |
| `infoBg` | `#f9fafb` (= `soft`) | Info alert bg | same as `soft` |

Rule: status colors are only used as their tinted triplet (`fg` + `bg` +
`border`) via `alertStyle()` / `Alert` / `Badge` — never mix, e.g. `danger`
text on `soft`.

## 4. Radii & shadows

No named tokens — these literals live inside `ui-tokens.ts` and are the only
radius/shadow values in the kit:

| Value | Where |
|---|---|
| `10px` (`RADIUS`) | `card`, `softCard` |
| `8px` | `btn()` (all variants), `input`, `alertStyle()` |
| `999` (pill) | `Badge`, `PulseDot` |
| `0 1px 2px rgba(15, 23, 42, 0.05)` (`SHADOW`) | `card` only |
| `boxShadow: "none"` | `softCard` (elevation is expressed by white+border vs gray surface, not shadow) |

## 5. Z-index

**There are no z-index tokens and no `zIndex` usage anywhere in
`apps/web/src`.** Stacking is unmanaged by design; do not introduce z-index
values without adding a token to `ui-tokens.ts` first.

## 6. Spacing conventions

There is no spacing scale object; spacing is literal `rem` values used
consistently. Canonical values to reuse:

| Context | Value |
|---|---|
| Page gutter / vertical rhythm | `page`/`pageNarrow` padding `1.5rem 1.25rem 3rem` |
| Card padding | `1.25rem` (EmptyState: `2rem 1.25rem`) |
| Vertical stacks | `fieldStack` gap `1rem`; `stack(gap = "1rem")` |
| Horizontal rows | `row` gap `0.6rem` (flex, `alignItems: center`, `flexWrap: wrap`) |
| Button padding | `0.55rem 1.1rem` (regular) / `0.3rem 0.65rem` (`small`) |
| Input padding | `0.55rem 0.7rem` |
| Alert padding / margin | `0.7rem 0.9rem` / `0.75rem 0` |
| `Divider` margin | `1.25rem 0` |
| `AppNav` inner padding | `0.75rem 1.25rem` |

## 7. Typography scale

Font family is `system-ui, sans-serif` globally (set on `body`). No font
tokens; the scale is:

| Style | Spec |
|---|---|
| `h1` | `1.6rem`, line-height `1.25`, letter-spacing `-0.01em`, margin `0 0 0.35rem` (AuthShell overrides size to `1.35rem`) |
| `h2` | `1.15rem`, margin `0 0 0.5rem` |
| Body / muted paragraph | browser default `1rem`; `muted` adds `0 0 0.75rem` bottom margin |
| `small` / `hintText` | `0.9rem`, muted |
| `fieldLabel` | `0.92rem`, weight 600, `0.3rem` below |
| `backLink` | `0.92rem`, muted, inline-block, `0.9rem` below |
| `btn` | `0.95rem`, weight 600 (ghost: 400); `small` variant `0.85rem` |
| `input` | **`16px`** — intentional, prevents iOS Safari auto-zoom on focus |
| `Badge` | `0.8rem`, weight 600 |
| Brand (AppNav / AuthShell) | `1.05rem` / `1.15rem`, weight 700, no underline |
| `link` | ink color + underline, `textUnderlineOffset: 2px` |

## 8. Component inventory

All from `lib/ui.tsx` unless marked *(tokens)*. Snippets assume
`import { ... } from "../../lib/ui"`.

### Buttons — `btn(variant, opts?)` *(tokens)*
Variants: `primary` (default; ink bg/white text), `secondary` (white bg,
ink text, strong border), `danger` (white bg, danger text, danger border),
`ghost` (transparent, muted text, weight 400). Options: `block` (full
width), `small`.

```tsx
<button style={btn("secondary")}>Cancel</button>
<Link href="/sign-up" style={btn("primary", { block: true })}>Create account</Link>
```

### Inputs — `input` *(tokens)*
Style object for `<input>`/`<textarea>`. Always `width: 100%` — fluid by
construction (360px-safe). Pair with `Field`.

### `Field` — label + control + hint
```tsx
<Field label="Email" htmlFor="email" hint="We never share it.">
  <input id="email" style={input} />
</Field>
```
`htmlFor` is required — every control gets a programmatic label.

### `Alert` — status messages
Kinds: `error | success | warning | info` (default `info`). Default ARIA
roles: `error`→`alert`, `warning`→`alert`, `success`→`status`, `info`→`note`;
override with the `role` prop.

```tsx
{error && <Alert kind="error">Invalid email or password.</Alert>}
<Alert kind="success" role="status">Saved.</Alert>
```

### `Badge` — status pills
Kinds: `neutral | success | warning | danger` (default `neutral`). Pill
span; spreads extra props onto the element.

```tsx
<Badge kind="success">Published</Badge>
```

### Surfaces — `card` / `softCard` *(tokens)*
`card`: white surface, hairline border, `RADIUS` + `SHADOW`, `1.25rem`
padding. `softCard`: same but `soft` background, no shadow — use for
secondary content.

### `EmptyState`
Centered quiet-state panel (softCard-based): `<EmptyState>No forms yet.</EmptyState>`.

### `AppNav` — dashboard top bar
White header with bottom hairline; brand link (`t("common.appName")`) on the
left, children rendered in a `row` nav on the right.

```tsx
<AppNav><Link href="/dashboard" style={link}>Forms</Link></AppNav>
```

### `AuthShell` — centered auth/status shell
Full-height `soft` background, centered brand bar, and a `card` with an
`h1` title; `width` prop controls card width (default 400).

```tsx
<AuthShell title="Sign in">…form…</AuthShell>
```

### Page containers — `page` / `pageNarrow` *(tokens)*
Fluid centered containers: `page` max-width 880, `pageNarrow` (auth/status)
max-width 480; both `1.5rem 1.25rem 3rem` padding. `<main style={page}>`.

### Layout helpers — `stack(gap?)` / `row` / `fieldStack` *(tokens)*
`stack("1.5rem")` → vertical flex; `row` → horizontal flex with wrap;
`fieldStack` → the standard `1rem` vertical rhythm inside forms.

### Misc
- `PulseDot` — 8px aria-hidden pulsing dot (uses global `uiPulse`
  keyframes); pair with `role="status"` text for in-progress states.
- `Divider` — horizontal hairline between stacked sections.
- Text styles: `h1`, `h2`, `muted`, `small`, `link`, `backLink`, `hintText`,
  `fieldLabel`.
- `alertStyle(kind)` *(tokens)* — the tinted panel style behind `Alert`;
  public forms use it directly.

## 9. Accessibility requirements

- **Focus:** the `:focus-visible` ring (2px solid `#1f2937`, offset 2px) is
  global from `app/layout.tsx`. Never set `outline: "none"` in inline styles.
- **Roles:** `Alert` self-assigns `alert`/`status`/`note`; keep the defaults
  unless there is a reason. Async save states use `role="status"` text
  (e2e asserts on it).
- **Labels:** `Field` requires `htmlFor`; controls must be reachable by
  `getByLabel` (the e2e `signIn` helper relies on this).
- **axe gate in e2e:** `e2e/tests/helpers.ts` →
  `assertNoSeriousAxeViolations(page, label)` scans with
  `@axe-core/playwright` (`withTags(["wcag2a", "wcag2aa"])`) and **fails the
  run on any serious or critical violation**. It runs on sign-in, the
  dashboard form list, the builder, the public form at 360px, the inbox
  list, and the inbox detail (`e2e/tests/inbox-happy-path.spec.ts`).
  Moderate/minor violations are reported, not fatal.
- **Responsive seam:** `assertNoHorizontalScroll` requires the public form to
  have no horizontal scroll at 360px (+8px tolerance) — hence fluid inputs
  and wrapping `row`s.

## 10. Theming boundary: dashboard chrome vs respondent forms

- **Dashboard chrome** (nav, cards, builders, inbox) is hardwired to the
  neutral palette in `C` — it is not themable.
- **Respondent-facing forms** render from the form's stored
  `theme.preset` (see `packages/form-schema`: `Theme = { preset: "default" }`
  — the only preset today, `DEFAULT_THEME`). Published forms draw from the
  same `ui-tokens` palette; a new preset means extending the schema type and
  mapping presets to token overrides, not sprinkling new hex values into
  `app/f/[slug]/*`.
- Public form files may only use `ui-tokens` (never `lib/ui`) — see §2.
  Dashboard-only components (`AppNav`, `AuthShell`) must never leak into the
  respondent render path.
