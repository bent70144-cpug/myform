/**
 * Tiny .env loader shared by the dev scripts. Deliberately dependency-free
 * and simple: KEY=VALUE lines, `#` comments, blank lines, optional quotes.
 * Real environments never go through this — only local dev does.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * @param {string[]} candidates env file paths, first existing wins
 * @returns {{ vars: Record<string, string>, file: string }}
 */
export function loadEnvFile(candidates) {
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    const vars = {};
    const lines = readFileSync(file, "utf8").split("\n");
    for (const raw of lines) {
      const line = raw.trim();
      if (line.length === 0 || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
        (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
      ) {
        value = value.slice(1, -1);
      } else {
        const hash = value.indexOf(" #");
        if (hash >= 0) value = value.slice(0, hash).trim();
      }
      vars[key] = value;
    }
    return { vars, file };
  }
  return { vars: {}, file: "" };
}

/** Repo root, resolved relative to this file (scripts/lib → repo root). */
export function repoRoot() {
  return join(new URL("../..", import.meta.url).pathname);
}
