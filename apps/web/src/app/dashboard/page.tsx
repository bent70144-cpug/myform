import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { t } from "@form/i18n";
import { getServerSession } from "../../lib/session";
import { listForms } from "../../lib/forms";
import { formatReceivedAt } from "../../lib/submissions";
import {
  Alert,
  AppNav,
  Badge,
  C,
  EmptyState,
  btn,
  card,
  h1,
  h2,
  link,
  muted,
  page,
  row,
  small,
  stack,
} from "../../lib/ui";
import SignOutButton from "./SignOutButton";
import BootstrapWorkspace from "./BootstrapWorkspace";
import NewFormButton from "./NewFormButton";
import RenameForm from "./RenameForm";
import ResendVerificationForm from "../verify-email/ResendVerificationForm";

/**
 * Protected dashboard shell (spec: "The protected dashboard shell redirects
 * signed-out visitors; a revoked session redirects on the next request").
 *
 * The session is validated SERVER-SIDE on every request: getServerSession()
 * calls GET /v1/auth/session on the INTERNAL API URL with the incoming
 * cookie forwarded, wrapped in React cache() (one call per render). Null →
 * signed-out/invalid/revoked → redirect to /sign-in. middleware.ts never
 * authorizes anything (cookie-presence only, not a security boundary).
 *
 * Unverified users DO reach the dashboard here (they may sign in), but every
 * workspace/form/submission API route rejects them with 403
 * `email_unverified` — the shell shows the resend-verification prompt.
 *
 * Ticket 05: a verified user whose session has `workspace: null` gets the
 * small client bootstrap stepper. The server component itself never
 * triggers bootstrap (read-only session GET).
 *
 * Ticket 06 / v2: with a workspace present the shell shows the workspace
 * header card (name + role badge), the "Forms" heading row with the
 * client-side "New form" trigger, and THREE explicit list states — a failed
 * list read (error alert + retry link, a plain server-rendered anchor), an
 * empty workspace (empty state), or one card row per form with the dashboard
 * label, its created date, and the inline rename control. Each row links to
 * the form page shell at /dashboard/forms/{id}. The list GET runs
 * server-side on the internal API (read-only); all mutations run in the
 * browser.
 */
export default async function DashboardPage() {
  const session = await getServerSession();
  if (!session) {
    // Signed-out, invalid, or revoked (401 empty-body) → redirect.
    redirect("/sign-in?next=%2Fdashboard");
  }

  return (
    <>
      <AppNav>
        <SignOutButton />
      </AppNav>
      <main style={page}>
        <h1 style={h1}>{t("dashboard.title")}</h1>
        <p style={muted}>{t("dashboard.signedInAs", { email: session.email })}</p>

        {!session.emailVerified ? (
          <Alert kind="warning">
            <ResendVerificationForm initialEmail={session.email} />
          </Alert>
        ) : session.workspace ? (
          <FormsSection
            workspaceName={session.workspace.name}
            workspaceRole={session.workspace.role}
          />
        ) : (
          <BootstrapWorkspace />
        )}
      </main>
    </>
  );
}

/**
 * One form row: the same borderRadius-10 card look as before (white surface,
 * hairline border), laid out as a flex row that wraps on narrow screens so
 * the rename control drops below the label instead of overflowing.
 */
const formRowCard: CSSProperties = {
  background: C.white,
  border: `1px solid ${C.border}`,
  borderRadius: "10px",
  padding: "0.8rem 1rem",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: "0.6rem",
};

/**
 * The form list (server component). The list GET runs server-side on the
 * internal API; a failed read (non-200 or contract drift → null) is now its
 * OWN state — an error alert with a retry link — rather than being silently
 * conflated with "no forms yet". A retry is a plain full-page navigation
 * back to /dashboard, which re-runs the no-store server read; no client
 * handler, no mutation from a server component.
 */
async function FormsSection(props: {
  workspaceName: string;
  workspaceRole: string;
}) {
  const pageData = await listForms();

  return (
    <section style={{ ...stack("0.9rem"), marginTop: "1.5rem" }}>
      <div style={card}>
        <div style={{ ...row, justifyContent: "space-between" }}>
          <div style={{ minWidth: 0 }}>
            <div style={small}>{t("dashboard.workspace.label")}</div>
            <div
              style={{
                fontWeight: 600,
                color: C.ink,
                marginTop: "0.15rem",
                overflowWrap: "anywhere",
              }}
            >
              {props.workspaceName}
            </div>
          </div>
          <Badge kind="neutral">{props.workspaceRole}</Badge>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <h2 style={{ ...h2, margin: 0 }}>{t("dashboard.forms.title")}</h2>
        <NewFormButton />
      </div>

      {pageData === null ? (
        <Alert kind="error">
          <div style={row}>
            <span>{t("dashboard.forms.loadFailed")}</span>
            <a href="/dashboard" style={btn("secondary", { small: true })}>
              {t("dashboard.bootstrap.retry")}
            </a>
          </div>
        </Alert>
      ) : pageData.forms.length === 0 ? (
        <EmptyState>{t("dashboard.forms.empty")}</EmptyState>
      ) : (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: "0.6rem",
          }}
        >
          {pageData.forms.map((form) => (
            <li key={form.id} style={formRowCard}>
              <div style={{ minWidth: 0 }}>
                <Link
                  href={`/dashboard/forms/${form.id}`}
                  style={{ ...link, fontWeight: 600, textDecoration: "none" }}
                >
                  {form.name}
                </Link>
                <div style={{ ...small, marginTop: "0.1rem" }}>
                  {t("dashboard.forms.createdAt", {
                    date: formatReceivedAt(form.createdAt),
                  })}
                </div>
              </div>
              <RenameForm formId={form.id} currentName={form.name} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
