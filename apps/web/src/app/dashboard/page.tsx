import { redirect } from "next/navigation";
import Link from "next/link";
import { t } from "@form/i18n";
import { getServerSession } from "../../lib/session";
import { listForms } from "../../lib/forms";
import { formatReceivedAt } from "../../lib/submissions";
import { Alert, AppNav, C, EmptyState, h1, h2, link, muted, page, small, stack } from "../../lib/ui";
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
 * Ticket 06: with a workspace present the shell lists the active
 * workspace's forms (labels from `forms.name`) with a client-side
 * "New form" button and inline rename; each row links to the form page
 * shell at /dashboard/forms/{id}. The list GET runs server-side on the
 * internal API (read-only); all mutations run in the browser.
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
 * The form list (server component). The list GET runs server-side on the
 * internal API; a failed read renders the empty state rather than crashing
 * the shell.
 */
async function FormsSection(props: {
  workspaceName: string;
  workspaceRole: string;
}) {
  const pageData = await listForms();
  const forms = pageData?.forms ?? [];

  return (
    <section style={{ ...stack("0.9rem"), marginTop: "1.5rem" }}>
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
      <p style={small}>
        <strong>{t("dashboard.workspace.label")}:</strong> {props.workspaceName}{" "}
        <span style={{ color: C.muted }}>({props.workspaceRole})</span>
      </p>

      {forms.length === 0 ? (
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
          {forms.map((form) => (
            <li
              key={form.id}
              style={{
                background: C.white,
                border: `1px solid ${C.border}`,
                borderRadius: "10px",
                padding: "0.8rem 1rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "0.6rem",
              }}
            >
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
