import Link from "next/link";
import { t } from "@form/i18n";

/**
 * Public landing page. Deliberately a STATIC server component: no session
 * call, no /v1 fetch, no client bundle — the one page that must render even
 * when the API is unreachable. Every user-facing string comes from the
 * @form/i18n catalog (no hardcoded copy, per repo rule). Visual language
 * matches the rest of the app: system-ui, slate (#1f2937) primary, inline
 * styles (the web app has no CSS framework).
 */

const INK = "#1f2937";
const MUTED = "#555555";
const BORDER = "#e5e7eb";
const SOFT = "#f9fafb";

const linkStyle: React.CSSProperties = {
  color: INK,
  textDecoration: "none",
};

const primaryButtonStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "0.7rem 1.4rem",
  borderRadius: "0.5rem",
  border: `1px solid ${INK}`,
  background: INK,
  color: "#fff",
  fontSize: "0.95rem",
  fontWeight: 600,
  textDecoration: "none",
};

const secondaryButtonStyle: React.CSSProperties = {
  ...primaryButtonStyle,
  background: "transparent",
  color: INK,
  fontWeight: 400,
};

export default function Home() {
  const features = [
    { title: t("home.features.builderTitle"), body: t("home.features.builderBody") },
    { title: t("home.features.publishTitle"), body: t("home.features.publishBody") },
    { title: t("home.features.inboxTitle"), body: t("home.features.inboxBody") },
    { title: t("home.features.privacyTitle"), body: t("home.features.privacyBody") },
  ];
  const steps = [
    { title: t("home.how.step1Title"), body: t("home.how.step1Body") },
    { title: t("home.how.step2Title"), body: t("home.how.step2Body") },
    { title: t("home.how.step3Title"), body: t("home.how.step3Body") },
  ];

  return (
    <div style={{ color: INK, fontFamily: "inherit", lineHeight: 1.6 }}>
      {/* Header */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "0.75rem",
          maxWidth: 960,
          margin: "0 auto",
          padding: "1.25rem 2rem",
        }}
      >
        <Link href="/" style={{ ...linkStyle, fontSize: "1.15rem", fontWeight: 700 }}>
          {t("common.appName")}
        </Link>
        <nav style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <Link href="/sign-in" style={{ ...linkStyle, color: MUTED }}>
            {t("home.signInLink")}
          </Link>
          <Link href="/dashboard" style={{ ...primaryButtonStyle, padding: "0.45rem 1rem" }}>
            {t("home.openDashboard")}
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section
        style={{
          maxWidth: 760,
          margin: "0 auto",
          padding: "3.5rem 2rem 3rem",
          textAlign: "center",
        }}
      >
        <span
          style={{
            display: "inline-block",
            padding: "0.15rem 0.9rem",
            border: `1px solid ${BORDER}`,
            borderRadius: 999,
            fontSize: "0.8rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: MUTED,
            marginBottom: "1.5rem",
          }}
        >
          {t("home.badge")}
        </span>
        <h1 style={{ fontSize: "clamp(2rem, 5vw, 2.75rem)", lineHeight: 1.2, margin: "0 0 1rem" }}>
          {t("home.title")}
        </h1>
        <p style={{ fontSize: "1.15rem", color: MUTED, margin: "0 auto 2rem", maxWidth: 600 }}>
          {t("home.subtitle")}
        </p>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            flexWrap: "wrap",
            gap: "0.75rem",
            marginBottom: "1rem",
          }}
        >
          <Link href="/sign-up" style={primaryButtonStyle}>
            {t("home.getStarted")}
          </Link>
          <Link href="/dashboard" style={secondaryButtonStyle}>
            {t("home.openDashboard")}
          </Link>
        </div>
        <p style={{ fontSize: "0.9rem", color: MUTED, margin: 0 }}>{t("home.heroHint")}</p>
      </section>

      {/* Features */}
      <section style={{ maxWidth: 960, margin: "0 auto", padding: "1rem 2rem 2.5rem" }}>
        <h2 style={{ textAlign: "center", fontSize: "1.5rem", marginBottom: "2rem" }}>
          {t("home.featuresHeading")}
        </h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
          {features.map((feature) => (
            <div
              key={feature.title}
              style={{
                flex: "1 1 300px",
                border: `1px solid ${BORDER}`,
                borderRadius: "0.5rem",
                padding: "1.5rem",
                background: SOFT,
              }}
            >
              <h3 style={{ fontSize: "1.05rem", margin: "0 0 0.5rem" }}>{feature.title}</h3>
              <p style={{ fontSize: "0.95rem", color: MUTED, margin: 0 }}>{feature.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section style={{ maxWidth: 960, margin: "0 auto", padding: "1rem 2rem 2.5rem" }}>
        <h2 style={{ textAlign: "center", fontSize: "1.5rem", marginBottom: "2rem" }}>
          {t("home.howHeading")}
        </h2>
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: "1.5rem" }}>
          {steps.map((step, index) => (
            <li key={step.title} style={{ flex: "1 1 220px" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  background: INK,
                  color: "#fff",
                  fontSize: "0.9rem",
                  marginBottom: "0.75rem",
                }}
              >
                {index + 1}
              </span>
              <h3 style={{ fontSize: "1.05rem", margin: "0 0 0.4rem" }}>{step.title}</h3>
              <p style={{ fontSize: "0.95rem", color: MUTED, margin: 0 }}>{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Closing CTA */}
      <section style={{ maxWidth: 960, margin: "0 auto", padding: "1rem 2rem 3rem" }}>
        <div
          style={{
            background: SOFT,
            border: `1px solid ${BORDER}`,
            borderRadius: "0.75rem",
            padding: "2.5rem 2rem",
            textAlign: "center",
          }}
        >
          <h2 style={{ fontSize: "1.5rem", margin: "0 0 0.5rem" }}>{t("home.ctaHeading")}</h2>
          <p style={{ color: MUTED, margin: "0 0 1.5rem" }}>{t("home.ctaBody")}</p>
          <Link href="/sign-up" style={primaryButtonStyle}>
            {t("home.getStarted")}
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer
        style={{
          borderTop: `1px solid ${BORDER}`,
          padding: "1.5rem 2rem",
          maxWidth: 960,
          margin: "0 auto",
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "0.75rem",
          fontSize: "0.9rem",
          color: MUTED,
        }}
      >
        <span>
          <strong style={{ color: INK }}>{t("common.appName")}</strong> — {t("home.footerNote")}
        </span>
        <nav style={{ display: "flex", gap: "1rem" }}>
          <Link href="/sign-in" style={{ color: MUTED }}>
            {t("home.signInLink")}
          </Link>
          <Link href="/sign-up" style={{ color: MUTED }}>
            {t("home.getStarted")}
          </Link>
        </nav>
      </footer>
    </div>
  );
}
