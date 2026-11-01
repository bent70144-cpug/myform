import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { account, session, user, verification } from "./auth-schema.js";

/**
 * Better Auth instance for the alpha topology spike (spec: "Identity and
 * sessions"). Pinned better-auth 1.7.15, mounted in NestJS under
 * `/v1/auth`, Drizzle adapter against the non-public `auth` schema.
 *
 * The user-ID decision (ADR-0004) is expressed here:
 * `advanced.database.generateId: "uuid"` makes Better Auth omit the id on
 * insert for pg (adapter reports native UUID support) and let the column
 * default `gen_random_uuid()` generate the id. Every auth id column is
 * `uuid`, and `app.user_id` will be a uuid reference — the two never
 * diverge.
 */
export function createSpikeAuth(options: {
  pool: Pool;
  secret: string;
  baseURL: string;
}) {
  const db = drizzle(options.pool);
  return betterAuth({
    secret: options.secret,
    baseURL: options.baseURL,
    basePath: "/v1/auth",
    emailAndPassword: { enabled: true },
    advanced: {
      database: {
        generateId: "uuid",
      },
    },
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user, session, account, verification },
    }),
  });
}
