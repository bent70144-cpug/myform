import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { t } from "@form/i18n";

/**
 * Master-prompt UI wiring — source contracts.
 *
 * Behavior stays proven at the logic seams (their own test files). Here we
 * pin the WIRING the spec cares about: the builder page keeps exactly ONE
 * `role="status"` live region (e2e strict-locates it for autosave settling)
 * and no second "Publish" accessible name (the unique button lives in
 * PublishControls); the draft preview mounts the SAME renderer respondents
 * get (PublicFormView) with zero network calls; the password-reset forms
 * post Better Auth's exact body schema through the same-origin /v1 rewrite;
 * the dashboard renders a dedicated list-failure state; sign-in hosts the
 * aria-pressed show/hide toggle; and every key this batch introduced
 * resolves through the @form/i18n catalog.
 */

const WEB_ROOT = path.resolve(__dirname, "..");

function readWebSource(relPath: string): string {
  return fs.readFileSync(path.join(WEB_ROOT, relPath), "utf8");
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("builder toolbar", () => {
  const toolbar = readWebSource("src/app/dashboard/forms/[id]/BuilderToolbar.tsx");

  it("keeps exactly ONE role=status live region whose saved text is the catalog key", () => {
    // e2e's waitForDraftSettled strict-locates the single role=status and
    // waits for "All changes saved" — a second live region breaks the locator.
    expect(countOccurrences(toolbar, 'role="status"')).toBe(1);
    expect(toolbar).toContain("dashboard.builder.status.saved");
  });

  it("never renders a Publish label (the unique button lives in PublishControls)", () => {
    // The status badge keys are dashboard.publish.status.* — but the PUBLISH
    // button key must stay out of the toolbar or e2e's Publish locator
    // becomes ambiguous.
    expect(toolbar).not.toContain("dashboard.publish.publish");
  });

  it("renders Preview as a real button", () => {
    expect(toolbar).toContain("dashboard.builder.preview.show");
    expect(toolbar).toContain('type="button"');
  });
});

describe("builder client", () => {
  const builder = readWebSource("src/app/dashboard/forms/[id]/BuilderClient.tsx");

  it("wires BuilderToolbar and the draft PreviewModal", () => {
    expect(builder).toContain('import BuilderToolbar from "./BuilderToolbar";');
    expect(builder).toContain('import PreviewModal from "./PreviewModal";');
    // The preview stage receives the live draft schema, not a stale copy.
    expect(builder).toContain("schema={schema}");
  });

  it("renders no second role=status (the toolbar owns the only live region)", () => {
    expect(countOccurrences(builder, 'role="status"')).toBe(0);
  });
});

describe("preview modal (honest draft preview)", () => {
  const preview = readWebSource("src/app/dashboard/forms/[id]/PreviewModal.tsx");

  it("mounts the public renderer from the f/[slug] page path", () => {
    // No second renderer implementation: the draft is shown through the SAME
    // component respondents get on the public page.
    expect(preview).toContain('from "../../../f/[slug]/PublicFormView"');
  });

  it("is offline, titled via the catalog, and framed by Modal + Tabs from lib/ui", () => {
    // The draft never leaves the page: no network calls, no session creation.
    expect(preview).not.toContain("fetch(");
    expect(preview).toContain("dashboard.builder.preview.title");
    const uiImport = preview
      .split("\n")
      .find((line) => line.includes("lib/ui"));
    expect(uiImport, "lib/ui import line").toBeDefined();
    expect(uiImport).toContain("Modal");
    expect(uiImport).toContain("Tabs");
  });
});

describe("password reset wiring", () => {
  it("forgot-password posts { email, redirectTo } to the same-origin enumeration-safe endpoint", () => {
    const form = readWebSource("src/app/forgot-password/ForgotPasswordForm.tsx");
    expect(form).toContain('"/v1/auth/request-password-reset"');
    expect(form).toContain("redirectTo");
    // The emailed link lands back on the sibling reset page of THIS origin.
    expect(form).toContain('"/reset-password"');
    // Every 2xx swaps to the ONE shared enumeration-safe confirmation.
    expect(form).toContain("auth.enumerationSafeResponse");
    expect(form).toContain('credentials: "same-origin"');
  });

  it("reset-password posts { token, newPassword } to the same-origin endpoint", () => {
    const form = readWebSource("src/app/reset-password/ResetPasswordForm.tsx");
    expect(form).toContain('"/v1/auth/reset-password"');
    expect(form).toContain("newPassword");
    expect(form).toContain("token");
    expect(form).toContain('credentials: "same-origin"');
  });
});

describe("dashboard states", () => {
  it("keeps the session gate and renders a dedicated list-failure state", () => {
    const page = readWebSource("src/app/dashboard/page.tsx");
    expect(page).toContain("getServerSession");
    expect(page).toContain('redirect("/sign-in');
    expect(page).toContain("listForms");
    // A failed list read is its OWN alert state, never "no forms yet".
    expect(page).toContain("dashboard.forms.loadFailed");
  });
});

describe("sign-in password toggle + forgot-password link", () => {
  it("hosts the aria-pressed show/hide toggle without touching the email endpoint", () => {
    const form = readWebSource("src/app/sign-in/SignInForm.tsx");
    expect(form).toContain("auth.signIn.showPassword");
    expect(form).toContain("auth.signIn.hidePassword");
    expect(form).toContain("aria-pressed");
    expect(form).toContain("/forgot-password");
    expect(form).toContain("/v1/auth/sign-in/email");
  });
});

describe("catalog coverage for the master-prompt keys", () => {
  const NEW_KEYS = [
    "common.close",
    "common.dismiss",
    "common.confirm",
    "common.cancel",
    "dashboard.forms.loadFailed",
    "dashboard.builder.preview.show",
    "dashboard.builder.preview.title",
    "dashboard.builder.preview.desktop",
    "dashboard.builder.preview.mobile",
    "dashboard.builder.preview.hint",
    "dashboard.builder.canvas.label",
    "dashboard.builder.canvas.respondentView",
    "dashboard.builder.canvas.editorView",
    "auth.signIn.showPassword",
    "auth.signIn.hidePassword",
    "auth.forgotPassword.sentTitle",
    "public.form.progressOf",
    "public.form.progressLabel",
    "public.form.answeredOf",
  ] as const;

  it("every new key resolves through t() without throwing", () => {
    for (const key of NEW_KEYS) {
      expect(() => t(key as Parameters<typeof t>[0]), key).not.toThrow();
    }
  });
});
