import Link from "next/link";
import { t } from "@form/i18n";
import { AuthShell, btn, muted } from "../lib/ui";

/**
 * App-wide 404. Next renders this for every notFound() call and every
 * unknown route — the inbox's deliberately-indistinguishable 404s included —
 * so it stays a STATIC server component with no session call and no fetch.
 * All copy comes from the i18n catalog.
 */
export default function NotFound() {
  return (
    <AuthShell title={t("notFound.title")}>
      <p
        aria-hidden="true"
        style={{
          fontSize: "2.4rem",
          fontWeight: 700,
          letterSpacing: "0.04em",
          color: "#555555",
          margin: "0 0 0.5rem",
        }}
      >
        {t("notFound.code")}
      </p>
      <p style={muted}>{t("notFound.body")}</p>
      <div style={{ marginTop: "1rem" }}>
        <Link href="/" style={btn("primary")}>
          {t("common.backHome")}
        </Link>
      </div>
    </AuthShell>
  );
}
