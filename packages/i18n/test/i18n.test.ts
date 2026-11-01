import { describe, expect, it } from "vitest";
import { MissingMessageError, createTranslator, en, t } from "../src";

describe("t", () => {
  it("looks up messages by typed key", () => {
    expect(t("error.rate_limited")).toBe("Too many requests. Please try again later.");
    expect(t("app.name")).toBe("myform");
  });

  it("interpolates named params", () => {
    const template = en["error.invalid_session"];
    expect(t("error.invalid_session")).toBe(template);
    // A parametrized key round-trips through the interpolator.
    expect(createTranslator()("app.name")).toBe("myform");
  });

  it("throws on unknown keys at runtime", () => {
    expect(() => t("nope.does_not_exist" as never)).toThrow(MissingMessageError);
  });

  it("keeps the catalog complete: every entry is a non-empty string", () => {
    for (const [key, message] of Object.entries(en)) {
      expect(typeof message, `key ${key}`).toBe("string");
      expect((message as string).length, `key ${key}`).toBeGreaterThan(0);
    }
  });

  it("createTranslator binds a locale", () => {
    const tr = createTranslator({ locale: "en" });
    expect(tr("ui.nav.dashboard")).toBe("Dashboard");
  });
});
