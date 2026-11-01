-- 0007_fix_personal_workspace_race.sql — race-safe personal-workspace
-- bootstrap (found by the CI e2e suite: a fresh runner hit
-- `duplicate key value violates unique constraint
-- "workspaces_personal_creator_uq"`).
--
-- 0006's create_personal_workspace() arbitrated idempotency with a
-- check-then-INSERT (SELECT existing → INSERT). Two concurrent bootstrap
-- requests for the same user (e.g. the dashboard firing bootstrap while the
-- session endpoint resolves, or any client double-tap) can both observe "no
-- existing workspace" and both INSERT — the partial unique index then rejects
-- the loser with a 500 instead of coalescing.
--
-- Fix: keep the index as the ONLY arbiter. The INSERT gains
-- `ON CONFLICT (creator) WHERE is_personal AND deleted_at IS NULL
-- DO NOTHING RETURNING id`; on conflict the loser re-reads the winner's row
-- and returns it. Postgres serializes the contenders on the unique index
-- itself (the loser's INSERT waits until the winner commits), so exactly one
-- workspace, membership, General project, audit row, and outbox event exist
-- per user — same guarantees as 0006, now under concurrency.
--
-- Semantics unchanged for every serial caller (0006 contract preserved):
-- existing personal workspace wins with no duplicate audit/outbox writes.
-- CREATE OR REPLACE keeps the fn_owner ownership and the 0006 ACLs.

GRANT CREATE ON SCHEMA app TO fn_owner;  -- transient, revoked at the end

SET LOCAL ROLE fn_owner;

CREATE OR REPLACE FUNCTION app.create_personal_workspace()
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = app, pg_temp
AS $fn$
DECLARE
  v_user      uuid;
  v_workspace uuid;
BEGIN
  v_user := nullif(current_setting('app.user_id', true), '')::uuid;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'create_personal_workspace: app.user_id is not set';
  END IF;

  -- Idempotency fast path: the user's existing personal workspace wins. This
  -- path writes NO duplicate audit row and NO duplicate outbox event.
  SELECT w.id INTO v_workspace
  FROM app.workspaces w
  WHERE w.creator = v_user
    AND w.is_personal
    AND w.deleted_at IS NULL
  LIMIT 1;
  IF v_workspace IS NOT NULL THEN
    RETURN v_workspace;
  END IF;

  -- ADR 0002 prefers app-side uuidv7; gen_random_uuid() here is the
  -- documented server-side exception for the SQL-only bootstrap path.
  v_workspace := gen_random_uuid();

  -- Set the tenant context BEFORE the inserts so the fn_owner WITH CHECK
  -- clauses pass (fn_owner has no BYPASSRLS; forced RLS binds its owner too).
  PERFORM set_config('app.workspace_id', v_workspace::text, true);

  -- The partial unique index is the concurrency arbiter: a racing INSERT for
  -- the same creator waits on the index until the winner commits, then
  -- conflicts and writes nothing. The winner's follow-up rows (membership,
  -- project, audit, outbox) are the only ones.
  INSERT INTO app.workspaces (id, name, creator, is_personal)
  VALUES (v_workspace, 'Personal Workspace', v_user, true)
  ON CONFLICT (creator) WHERE is_personal AND deleted_at IS NULL DO NOTHING
  RETURNING id INTO v_workspace;

  IF v_workspace IS NULL THEN
    -- Lost the race: the winner already inserted everything this function
    -- would have. Return the winning workspace id.
    SELECT w.id INTO v_workspace
    FROM app.workspaces w
    WHERE w.creator = v_user
      AND w.is_personal
      AND w.deleted_at IS NULL
    LIMIT 1;
    RETURN v_workspace;
  END IF;

  INSERT INTO app.workspace_members (id, workspace_id, user_id, role)
  VALUES (gen_random_uuid(), v_workspace, v_user, 'owner');

  INSERT INTO app.projects (id, workspace_id, name, is_default)
  VALUES (gen_random_uuid(), v_workspace, 'General', true);

  INSERT INTO app.audit_logs (id, workspace_id, actor, action)
  VALUES (gen_random_uuid(), v_workspace, v_user, 'workspace.created');

  -- Outbox: the workspace id travels in the payload (no workspace_id column).
  INSERT INTO app.outbox_events (id, event_type, payload)
  VALUES (
    gen_random_uuid(),
    'workspace.created',
    jsonb_build_object('workspaceId', v_workspace, 'userId', v_user)
  );

  RETURN v_workspace;
END;
$fn$;

RESET ROLE;

-- fn_owner is NOLOGIN and never creates objects outside migrations:
-- take the transient schema-CREATE privilege back.
REVOKE CREATE ON SCHEMA app FROM fn_owner;
