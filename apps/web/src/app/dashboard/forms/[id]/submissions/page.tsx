import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { t } from "@form/i18n";
import { getServerSession } from "../../../../../lib/session";
import { getForm } from "../../../../../lib/forms";
import { formatReceivedAt, listSubmissions } from "../../../../../lib/submissions";
import {
  Alert,
  AppNav,
  backLink,
  Badge,
  btn,
  C,
  card,
  EmptyState,
  h1,
  link,
  muted,
  page as pageStyle,
} from "../../../../../lib/ui";

/**
 * Submission inbox — the per-form LIST (ticket 11, polished).
 *
 * Server component pattern of the dashboard (session redirect, form read on
 * the internal API with the cookie forwarded): a 404 on the FORM — unknown
 * id OR another workspace's form, deliberately indistinguishable — renders
 * Next's not-found page; the SUBMISSIONS read failing after a good form read
 * renders the i18n load-failed state instead of crashing the shell.
 *
 * Rows are newest-first (the API orders by (created_at, id) DESC) and render
 * as calm cards: the received time (deterministic UTC stamp from
 * lib/submissions) is the row's single semibold link on the left, the form
 * version the respondent saw is a badge on the right, and an aria-hidden
 * chevron (pure decoration) hints that the row opens the
 * answer-beside-question detail. Rows wrap instead of overflowing on small
 * screens. When the API reports another page, an "Older submissions" link
 * advances the opaque cursor (server-rendered pagination; no client state).
 *
 * Labels/answers are DATA here (list level: none rendered) — detail text is
 * rendered by React as escaped plain text (no dangerouslySetInnerHTML
 * anywhere in the inbox). All strings come from the i18n catalog.
 */
export default async function SubmissionsPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const session = await getServerSession();
  if (!session) {
    redirect("/sign-in?next=%2Fdashboard");
  }

  const { id } = await props.params;
  const form = await getForm(id);
  if (!form) {
    notFound();
  }

  const { cursor } = await props.searchParams;
  const page = await listSubmissions(id, cursor);
  const submissions = page?.submissions ?? [];

  return (
    <>
      <AppNav />
      <main style={pageStyle}>
        <Link href={`/dashboard/forms/${id}`} style={backLink}>
          {t("dashboard.inbox.backToForm")}
        </Link>

        <h1 style={h1}>{t("dashboard.inbox.title")}</h1>
        <p style={{ ...muted, marginTop: 0 }}>{form.name}</p>

        {page === null ? (
          <Alert kind="error" role="alert">{t("dashboard.inbox.loadFailed")}</Alert>
        ) : submissions.length === 0 ? (
          <EmptyState>
            <p data-testid="inbox-empty" style={{ margin: 0 }}>
              {t("dashboard.inbox.empty")}
            </p>
          </EmptyState>
        ) : (
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
            }}
            data-testid="inbox-list"
          >
            {submissions.map((submission) => (
              <li
                key={submission.id}
                style={{
                  ...card,
                  padding: "0.85rem 1rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "0.5rem 0.75rem",
                }}
                data-testid="inbox-row"
              >
                <Link
                  href={`/dashboard/forms/${id}/submissions/${submission.id}`}
                  style={{
                    ...link,
                    textDecoration: "none",
                    fontWeight: 600,
                    minWidth: 0,
                  }}
                >
                  {t("dashboard.inbox.receivedAt", {
                    date: formatReceivedAt(submission.createdAt),
                  })}
                </Link>
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    flexShrink: 0,
                  }}
                >
                  <Badge data-testid="inbox-row-version">
                    {t("dashboard.inbox.versionBadge", {
                      version: submission.formVersionNumber,
                    })}
                  </Badge>
                  <span
                    aria-hidden="true"
                    style={{ color: C.muted, fontSize: "1.25rem", lineHeight: 1 }}
                  >
                    ›
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}

        {page?.nextCursor ? (
          <p style={{ marginTop: "1.25rem" }}>
            <Link
              href={`/dashboard/forms/${id}/submissions?cursor=${encodeURIComponent(page.nextCursor)}`}
              style={btn("secondary")}
            >
              {t("dashboard.inbox.morePages")}
            </Link>
          </p>
        ) : null}
      </main>
    </>
  );
}
