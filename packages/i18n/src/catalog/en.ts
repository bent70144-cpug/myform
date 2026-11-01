/**
 * English message catalog (M0 ships English only). UI strings and API error
 * messages are looked up by key here — never hardcoded at call sites.
 * Keys are flat `dotted.path` strings; values are message templates with
 * `{named}` placeholders.
 */
export const en = {
  "app.name": "myform",
  "app.tagline": "Collect client intake with conversational forms",

  "health.check.db": "database",
  "health.db.unreachable": "The service is live but the database is unreachable.",

  "error.validation_failed": "Some values are not valid. Check the highlighted fields.",
  "error.invalid_character": "This value contains characters that cannot be stored.",
  "error.schema_too_large": "This form is too large to save.",
  "error.submission_too_large": "These answers are too large to submit.",
  "error.unauthorized": "Please sign in to continue.",
  "error.forbidden": "You do not have access to this resource.",
  "error.not_found": "This page could not be found.",
  "error.conflict": "This action conflicts with the current state.",
  "error.rate_limited": "Too many requests. Please try again later.",
  "error.internal_error": "Something went wrong on our side.",
  "error.email_unverified": "Verify your email address before continuing.",
  "error.draft_conflict": "This draft changed in another tab. Reload to continue.",
  "error.form_full": "This form is no longer accepting responses.",
  "error.origin_mismatch": "This request did not come from the application.",
  "error.invalid_session": "This session is no longer valid.",

  "ui.nav.dashboard": "Dashboard",
  "ui.auth.sign_in.title": "Sign in",
  "ui.dashboard.setting_up_workspace": "Setting up your workspace…",
  "ui.health.status.live": "Service is live",
  "ui.health.status.db_unreachable": "Service is live, but the database is unreachable",

  "public.form.closed": "This form is no longer accepting responses.",
  "public.form.not_found": "This form does not exist.",
} as const;

export type MessageKey = keyof typeof en;
export type MessageCatalog = Record<MessageKey, string>;
