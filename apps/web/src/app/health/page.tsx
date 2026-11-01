import { cache } from "react";
import { healthResponseSchema, type HealthResponse } from "@myform/contracts";
import { t } from "@myform/i18n";
import { readWebEnv } from "../../env";

export const dynamic = "force-dynamic";

/**
 * Server components call the internal API URL directly (never through the
 * public rewrite), wrapped in React `cache()` so one render shares one
 * request. Validated with the shared Zod contract, never cast.
 */
const fetchHealth = cache(async (): Promise<HealthResponse | null> => {
  const { INTERNAL_API_URL } = readWebEnv();
  try {
    const res = await fetch(`${INTERNAL_API_URL}/v1/health`, { cache: "no-store" });
    if (!res.ok) return null;
    return healthResponseSchema.parse(await res.json());
  } catch {
    return null;
  }
});

export default async function HealthPage() {
  const health = await fetchHealth();
  const live = health?.status === "ok";
  return (
    <main>
      <h1>{t("app.name")}</h1>
      <p>{live ? t("ui.health.status.live") : t("ui.health.status.db_unreachable")}</p>
      <p>
        {t("health.check.db")}: {health?.checks.database ?? "down"}
      </p>
    </main>
  );
}
