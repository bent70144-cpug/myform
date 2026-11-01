-- Baseline tenant-safety wiring for the app schema. Domain tables arrive
-- with their own feature migrations; this migration establishes the
-- grant/default-privilege posture so every later tenant table starts
-- locked down: PUBLIC has nothing, runtime roles only what is granted.

REVOKE ALL ON SCHEMA app FROM PUBLIC;

ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE ALL ON FUNCTIONS FROM PUBLIC;
