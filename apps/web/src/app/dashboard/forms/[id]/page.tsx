import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { t } from "@form/i18n";
import { getServerSession } from "../../../../lib/session";
import { getForm } from "../../../../lib/forms";
import { resolveAppOrigin } from "../../../../lib/app-origin";
import {
  AppNav,
  backLink,
  btn,
  card,
  h1,
  page,
  row,
  small,
  stack,
} from "../../../../lib/ui";
import RenameForm from "../../RenameForm";
import BuilderClient from "./BuilderClient";
import PublishControls from "./PublishControls";

/**
 * Form page — T06 shell + the T08 builder + the T09 publish controls.
 *
 * The server component validates the session (redirect when signed out),
 * then reads the form + draft from the internal API (GET /v1/forms/{id} with
 * the incoming cookie forwarded). A 404 — unknown id OR a form of another
 * workspace, deliberately indistinguishable — renders Next's not-found page.
 *
 * What renders where (spec data model):
 * - `forms.name` is the DASHBOARD label (with the inline rename control,
 *   ticket 06) — never respondent-facing;
 * - the respondent-facing title is the draft envelope's `title`, edited by
 *   the builder below (ticket 08) together with the M0 blocks;
 * - the builder is a CLIENT component: edits autosave the FULL draft through
 *   the same-origin /v1/* rewrite with optimistic `draft_version` (T07 API);
 * - the publish controls (ticket 09) render the status / published version,
 *   the Publish / Republish / Unpublish buttons and the copy-link action;
 *   they track their own client-side status after each mutation. The public
 *   origin for {APP_ORIGIN}/f/{slug} is derived from the incoming request
 *   headers (proxy hop chain) with NEXT_PUBLIC_APP_ORIGIN as fallback.
 */
export default async function FormPage(props: {
  params: Promise<{ id: string }>;
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

  const requestHeaders = await headers();
  const appOrigin =
    resolveAppOrigin({
      forwardedHost: requestHeaders.get("x-forwarded-host"),
      host: requestHeaders.get("host"),
      forwardedProto: requestHeaders.get("x-forwarded-proto"),
      envOrigin: process.env.NEXT_PUBLIC_APP_ORIGIN,
    }) ?? "";

  return (
    <>
      <AppNav />
      <main style={page}>
        <Link href="/dashboard" style={backLink}>
          {t("dashboard.forms.backToDashboard")}
        </Link>

        <section style={{ ...card, marginBottom: "1rem" }}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "0.6rem",
            }}
          >
            <h1 style={{ ...h1, marginBottom: 0 }}>{form.name}</h1>
            <RenameForm formId={form.id} currentName={form.name} />
          </div>
          <p style={{ ...small, marginTop: "0.5rem", marginBottom: 0 }}>
            <strong>{t("dashboard.forms.draftLabel")}:</strong>{" "}
            {t("dashboard.forms.draftVersion", {
              version: form.draft.draftVersion,
            })}
          </p>
          <div style={{ ...row, marginTop: "0.9rem" }}>
            <Link
              href={`/dashboard/forms/${form.id}/submissions`}
              style={btn("secondary")}
            >
              {t("dashboard.inbox.open")}
            </Link>
          </div>
        </section>

        <PublishControls formId={form.id} status={form.status} appOrigin={appOrigin} />

        <div style={{ ...stack("0.75rem"), marginTop: "1rem" }}>
          <BuilderClient
            formId={form.id}
            initialSchema={form.draft.schema}
            initialDraftVersion={form.draft.draftVersion}
          />
        </div>
      </main>
    </>
  );
}
