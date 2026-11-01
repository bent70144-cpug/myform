import { boolean, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Better Auth tables in the non-public `auth` schema (spec: "Identity and
 * sessions", "Tenancy and authorization"). The spike fixture migration
 * (`spike/migrations/0001_spike_rls_fixture.sql`) creates the matching DDL
 * as `migrator`; this schema is what the Better Auth Drizzle adapter
 * reads/writes through the API's `app_user` connection.
 *
 * User-ID representation (ADR-0004): every id column is `uuid` with a
 * `gen_random_uuid()` database default, matching Better Auth's
 * `advanced.database.generateId: "uuid"` setting (pinned 1.7.15). Field
 * properties use Better Auth's camelCase field names; columns are
 * snake_case.
 */
export const authSchema = pgSchema("auth");

export const user = authSchema.table("user", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = authSchema.table("session", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const account = authSchema.table("account", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = authSchema.table("verification", {
  id: uuid("id").primaryKey().defaultRandom(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
