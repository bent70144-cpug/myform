import { t } from "@myform/i18n";

/**
 * Dashboard stub (M0 walking skeleton). Product surfaces arrive with the
 * auth-core slice; this page proves the app shell, i18n lookup, and the
 * internal API hop render correctly.
 */
export default function DashboardPage() {
  return (
    <main>
      <h1>{t("app.name")}</h1>
      <p>{t("app.tagline")}</p>
      <p>
        <a href="/health">{t("ui.health.status.live")}</a>
      </p>
    </main>
  );
}
