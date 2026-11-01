import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { t, type MessageKey } from "@form/i18n";

/**
 * Landing page (public home at "/") source contracts.
 *
 * The landing is the one page that must stay a STATIC server component: no
 * session call, no /v1 fetch, no client bundle — it has to render even when
 * the API is unreachable. Copy comes from the @form/i18n catalog; routes
 * link to the real sign-up/dashboard flows.
 */
const WEB_ROOT = path.resolve(__dirname, "..");

function readWebSource(relPath: string): string {
  return fs.readFileSync(path.join(WEB_ROOT, relPath), "utf8");
}

describe("landing page (/)", () => {
  const source = readWebSource("src/app/page.tsx");

  it("renders hero copy through the i18n catalog, not hardcoded strings", () => {
    expect(source).toContain('t("home.title")');
    expect(source).toContain('t("home.subtitle")');
    expect(source).not.toContain("alpha topology spike");
  });

  it("exposes the sign-up and dashboard flows", () => {
    expect(source).toContain('"/sign-up"');
    expect(source).toContain('"/dashboard"');
    expect(source).toContain("next/link");
  });

  it("stays a static server component with no API or session dependency", () => {
    expect(source).not.toContain('"use client"');
    expect(source).not.toContain("getServerSession");
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("@form/database");
    expect(source).not.toContain("@form/auth");
  });

  it("uses only catalog keys that resolve", () => {
    const keys = [...source.matchAll(/t\("([A-Za-z0-9.]+)"/g)].map((m) => m[1]);
    // The landing has hero + 4 features + 3 steps + CTA + footer strings.
    expect(keys.length).toBeGreaterThanOrEqual(12);
    for (const key of keys) {
      expect(() => t(key as MessageKey), key).not.toThrow();
    }
  });

  it("root layout metadata no longer advertises the spike", () => {
    const layout = readWebSource("src/app/layout.tsx");
    expect(layout).not.toContain("Form M0");
    expect(layout).toContain("en.common.appName");
    expect(layout).toContain("en.home.subtitle");
  });
});
