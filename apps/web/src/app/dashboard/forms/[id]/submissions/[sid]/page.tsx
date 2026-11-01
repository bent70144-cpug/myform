import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { t } from "@form/i18n";
import { getServerSession } from "../../../../../../lib/session";
import { getForm } from "../../../../../../lib/forms";
import { formatReceivedAt, getSubmission } from "../../../../../../lib/submissions";
import {
  AppNav,
  backLink,
  Badge,
  C,
  card,
  h1,
  muted,
  page,
  softCard,
} from "../../../../../../lib/ui";

/**
 * Submission DETAIL (ticket 11) — each stored answer rendered BESIDE its
 * question label, with the received time and the form version badge.
 *
 * The pairing was computed by the API from the PINNED version's schema (the
 * version the respondent actually saw — never the mutable draft); this page
 * renders the pairs in the order the pinned schema ordered them. Labels and
 * answers arrive as plain text and render as ESCAPED plain text (React text
 * nodes — no dangerouslySetInnerHTML anywhere in the inbox).
 *
 * 404s stay indistinguishable: an unknown submission, one belonging to
 * another form, or one of another workspace all render Next's not-found page
 * (the API answered 404 the same way — no enumeration).
 */
export default async function SubmissionDetailPage(props: {
  params: Promise<{ id: string; sid: string }>;
}) {
  const session = await getServerSession();
  if (!session) {
    redirect("/sign-in?next=%2Fdashboard");
  }

  const { id, sid } = await props.params;
  const form = await getForm(id);
  if (!form) {
    notFound();
  }
  const submission = await getSubmission(id, sid);
  if (!submission) {
    notFound();
  }

  return (
    <>
      <AppNav />
      <main style={page} data-testid="inbox-detail">
        <Link href={`/dashboard/forms/${id}/submissions`} style={backLink}>
          {t("dashboard.inbox.backToInbox")}
        </Link>

        <h1 style={h1}>{t("dashboard.inbox.detailTitle")}</h1>
        <p
          style={{
            ...muted,
            marginTop: 0,
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.5rem",
          }}
        >
          {t("dashboard.inbox.receivedAt", {
            date: formatReceivedAt(submission.createdAt),
          })}
          <Badge data-testid="inbox-detail-version">
            {t("dashboard.inbox.versionBadge", {
              version: submission.formVersionNumber,
            })}
          </Badge>
        </p>

        <dl
          style={{
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
          }}
        >
          {submission.answers.map((pair) => (
            <div
              key={pair.blockId}
              data-testid="inbox-answer-pair"
              style={{
                ...card,
                padding: "0.9rem 1rem",
                margin: 0,
              }}
            >
              <dt style={{ fontWeight: 600 }}>
                {pair.label !== null
                  ? pair.label
                  : t("dashboard.inbox.unknownQuestion")}
              </dt>
              <dd
                style={{
                  ...softCard,
                  margin: "0.5rem 0 0",
                  whiteSpace: "pre-wrap",
                  padding: "0.6rem 0.75rem",
                  borderRadius: "8px",
                  color: C.ink,
                  border: `1px solid ${C.border}`,
                }}
                data-testid="inbox-answer"
              >
                {pair.answer}
              </dd>
            </div>
          ))}
        </dl>
      </main>
    </>
  );
}
