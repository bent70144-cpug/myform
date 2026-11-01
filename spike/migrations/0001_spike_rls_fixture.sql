-- Ticket 02 alpha topology spike fixture (applied by the ticket-01 migrator
-- as the `migrator` role against the embedded test Postgres).
--
-- It stands in for the DDL later tickets will ship, so the spike can prove
-- the role model end to end under the production posture:
--
--   1. Better Auth tables in the non-public `auth` schema (ticket 03's
--      auth DDL will own the real thing). Tables are migrator-owned;
--      `app_user` — the role the API connects with — gets DML only.
--   2. A tenant table with forced RLS, both policy clauses, an
--      `app_user` tenant policy driven by `app.workspace_id`, and a
--      function-scoped `TO fn_owner` policy driven by
--      `fn_owner.workspace_id` (the spec's pattern for security-definer
--      functions without BYPASSRLS).
--   3. Security-definer functions owned by the NOLOGIN `fn_owner`, with
--      pinned `search_path`, EXECUTE revoked from PUBLIC and granted to
--      `app_user` only.
--
-- Seeding happens BEFORE RLS is enabled: with forced RLS the table owner
-- is subject to the policies too, and `migrator` has no policy.

CREATE TABLE auth."user" (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  email_verified boolean NOT NULL DEFAULT false,
  image text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT auth_user_email_key UNIQUE (email)
);
--> statement-breakpoint
CREATE TABLE auth.session (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth."user"(id) ON DELETE CASCADE,
  token text NOT NULL,
  expires_at timestamp NOT NULL,
  ip_address text,
  user_agent text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT auth_session_token_key UNIQUE (token)
);
--> statement-breakpoint
CREATE TABLE auth.account (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  account_id text NOT NULL,
  provider_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth."user"(id) ON DELETE CASCADE,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamp,
  refresh_token_expires_at timestamp,
  scope text,
  password text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE auth.verification (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  identifier text NOT NULL,
  value text NOT NULL,
  expires_at timestamp NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
GRANT USAGE ON SCHEMA auth TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth TO app_user;
--> statement-breakpoint
CREATE TABLE app.spike_docs (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  workspace_id uuid NOT NULL,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT spike_docs_workspace_id_id_key UNIQUE (workspace_id, id)
);
--> statement-breakpoint
-- Seed two tenants' rows while RLS is still disabled.
INSERT INTO app.spike_docs (workspace_id, title) VALUES
  ('11111111-1111-4111-8111-111111111111', 'alpha-doc'),
  ('22222222-2222-4222-8222-222222222222', 'beta-doc');
--> statement-breakpoint
ALTER TABLE app.spike_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.spike_docs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- The `app_user` tenant policy: both clauses, unset/empty setting -> NULL
-- -> no rows (never a cast error).
CREATE POLICY spike_docs_app_user ON app.spike_docs
  FOR ALL TO app_user
  USING (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
-- The `fn_owner` policy: function-scoped, driven by a dedicated setting
-- the security-definer functions set themselves.
CREATE POLICY spike_docs_fn_owner ON app.spike_docs
  FOR ALL TO fn_owner
  USING (workspace_id = nullif(current_setting('fn_owner.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = nullif(current_setting('fn_owner.workspace_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON app.spike_docs TO app_user;
--> statement-breakpoint
-- Security-definer write path (the create_personal_workspace() pattern):
-- reads no caller-supplied tenant privilege, sets its own function-scoped
-- context, inserts under the fn_owner policy.
CREATE FUNCTION app.spike_create_doc(p_workspace_id uuid, p_title text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM set_config('fn_owner.workspace_id', p_workspace_id::text, true);
  INSERT INTO app.spike_docs (workspace_id, title)
    VALUES (p_workspace_id, p_title)
    RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
ALTER FUNCTION app.spike_create_doc(uuid, text) OWNER TO fn_owner;
REVOKE ALL ON FUNCTION app.spike_create_doc(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.spike_create_doc(uuid, text) TO app_user;
--> statement-breakpoint
-- Security-definer read path (the list_workspaces() pattern).
CREATE FUNCTION app.spike_list_docs_for_workspace(p_workspace_id uuid)
RETURNS TABLE (id uuid, title text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
  PERFORM set_config('fn_owner.workspace_id', p_workspace_id::text, true);
  RETURN QUERY
    SELECT d.id, d.title FROM app.spike_docs d WHERE d.workspace_id = p_workspace_id;
END;
$$;
ALTER FUNCTION app.spike_list_docs_for_workspace(uuid) OWNER TO fn_owner;
REVOKE ALL ON FUNCTION app.spike_list_docs_for_workspace(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.spike_list_docs_for_workspace(uuid) TO app_user;
