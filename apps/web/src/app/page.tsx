import Link from "next/link";
import { t } from "@form/i18n";
import { btn, C, hintText, row, softCard } from "../lib/ui";

/**
 * Public landing page. Deliberately a STATIC server component: no session
 * call, no /v1 fetch, no client bundle — the one page that must render even
 * when the API is unreachable. Every user-facing string comes from the
 * @form/i18n catalog (no hardcoded copy, per repo rule). Visual language
 * comes from the shared tokens in lib/ui.tsx: system-ui, slate (#1f2937)
 * primary, inline styles (the web app has no CSS framework).
 */

const linkStyle: React.CSSProperties = {
  color: C.ink,
  textDecoration: "none",
};

/** Shared container for the features / how-it-works / CTA bands — one rhythm. */
const sectionStyle: React.CSSProperties = {
  maxWidth: 960,
  margin: "0 auto",
  padding: "1.5rem 2rem",
};

const sectionHeading: React.CSSProperties = {
  textAlign: "center",
  fontSize: "1.5rem",
  letterSpacing: "-0.01em",
  margin: "0 0 1.25rem",
};

/** Feature cards reuse the shared soft-card token (surface, border, radius). */
const featureCardStyle: React.CSSProperties = {
  ...softCard,
  padding: "1.5rem",
};

const primaryButtonStyle = btn("primary");
const secondaryButtonStyle = btn("secondary");
const headerButtonStyle = btn("primary", { small: true });

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
    <div style={{ color: C.ink, fontFamily: "inherit", lineHeight: 1.6 }}>
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
          <Link href="/sign-in" style={{ ...linkStyle, color: C.muted }}>
            {t("home.signInLink")}
          </Link>
          <Link href="/dashboard" style={headerButtonStyle}>
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
            border: `1px solid ${C.border}`,
            borderRadius: 999,
            fontSize: "0.8rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: C.muted,
            marginBottom: "1.25rem",
          }}
        >
          {t("home.badge")}
        </span>
        <h1
          style={{
            fontSize: "clamp(2rem, 5vw, 2.75rem)",
            lineHeight: 1.2,
            letterSpacing: "-0.01em",
            margin: "0 0 1rem",
          }}
        >
          {t("home.title")}
        </h1>
        <p style={{ fontSize: "1.15rem", color: C.muted, margin: "0 auto 1.5rem", maxWidth: 600 }}>
          {t("home.subtitle")}
        </p>
        <div style={{ ...row, justifyContent: "center", marginBottom: "0.5rem" }}>
          <Link href="/sign-up" style={primaryButtonStyle}>
            {t("home.getStarted")}
          </Link>
          <Link href="/dashboard" style={secondaryButtonStyle}>
            {t("home.openDashboard")}
          </Link>
        </div>
        <p style={hintText}>{t("home.heroHint")}</p>
      </section>

      {/* Features */}
      <section style={sectionStyle}>
        <h2 style={sectionHeading}>{t("home.featuresHeading")}</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
          {features.map((feature) => (
            <div key={feature.title} style={featureCardStyle}>
              <h3 style={{ fontSize: "1.05rem", margin: "0 0 0.4rem" }}>{feature.title}</h3>
              <p style={{ fontSize: "0.95rem", color: C.muted, margin: 0 }}>{feature.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section style={sectionStyle}>
        <h2 style={sectionHeading}>{t("home.howHeading")}</h2>
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: "1.25rem" }}>
          {steps.map((step, index) => (
            <li key={step.title} style={{ flex: "1 1 220px" }}>
              <span
                aria-hidden="true"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  background: C.ink,
                  color: C.white,
                  fontSize: "0.9rem",
                  marginBottom: "0.6rem",
                }}
              >
                {index + 1}
              </span>
              <h3 style={{ fontSize: "1.05rem", margin: "0 0 0.4rem" }}>{step.title}</h3>
              <p style={{ fontSize: "0.95rem", color: C.muted, margin: 0 }}>{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Closing CTA */}
      <section style={{ ...sectionStyle, paddingBottom: "3rem" }}>
        <div style={{ ...softCard, padding: "2.5rem 2rem", textAlign: "center" }}>
          <h2 style={{ fontSize: "1.5rem", letterSpacing: "-0.01em", margin: "0 0 0.5rem" }}>
            {t("home.ctaHeading")}
          </h2>
          <p style={{ color: C.muted, margin: "0 0 1.25rem" }}>{t("home.ctaBody")}</p>
          <Link href="/sign-up" style={primaryButtonStyle}>
            {t("home.getStarted")}
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer
        style={{
          borderTop: `1px solid ${C.border}`,
          padding: "1.5rem 2rem",
          maxWidth: 960,
          margin: "0 auto",
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "0.75rem",
          fontSize: "0.9rem",
          color: C.muted,
        }}
      >
        <span>
          <strong style={{ color: C.ink }}>{t("common.appName")}</strong> — {t("home.footerNote")}
        </span>
        <nav style={{ display: "flex", gap: "1rem" }}>
          <Link href="/sign-in" style={{ color: C.muted }}>
            {t("home.signInLink")}
          </Link>
          <Link href="/sign-up" style={{ color: C.muted }}>
            {t("home.getStarted")}
          </Link>
        </nav>
      </footer>
    </div>
  );
}
