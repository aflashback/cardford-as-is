-- M04C is an explicitly separate loopback service, never a V1 record rewrite.
CREATE TABLE m04_sessions (
 token_hash text PRIMARY KEY,
 owner_id text NOT NULL REFERENCES m03_access(owner_id),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz
);
CREATE INDEX m04_sessions_owner ON m04_sessions(owner_id);
CREATE TABLE m04_controls (
 owner_id text PRIMARY KEY REFERENCES m03_access(owner_id),
 session_hash text NOT NULL REFERENCES m04_sessions(token_hash),
 tab_id text NOT NULL,
 lease_hash text NOT NULL,
 expires_at timestamptz NOT NULL
);
CREATE TABLE m04_service_commands (
 owner_id text NOT NULL REFERENCES m03_access(owner_id),
 command_id text NOT NULL,
 digest text NOT NULL,
 kind text NOT NULL,
 game_id text NOT NULL,
 revision bigint NOT NULL CHECK (revision >= 0),
 receipt_schema text NOT NULL,
 receipt bytea NOT NULL,
 PRIMARY KEY(owner_id,command_id)
);

-- The service sets this transaction-local scope only after authenticating and
-- locking that owner. Ordinary writes still cannot change accepted history.
-- Database administrators remain trusted, as for every original migration.
CREATE FUNCTION m04_erasing_row(row_data jsonb) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE wanted text; actual text;
BEGIN
 wanted := current_setting('cardford.erasing_owner',true);
 IF wanted IS NULL OR wanted = '' THEN RETURN false; END IF;
 actual := row_data->>'owner_id';
 IF actual IS NULL THEN
  SELECT owner_id INTO actual FROM m03_games WHERE game_id=row_data->>'game_id';
 END IF;
 RETURN actual IS NOT NULL AND actual=wanted;
END;
$$;
CREATE OR REPLACE FUNCTION m03_reject_history_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' AND m04_erasing_row(to_jsonb(OLD)) THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'accepted M03 history is immutable';
END;
$$;
CREATE OR REPLACE FUNCTION m03_protect_completed_work() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' AND m04_erasing_row(to_jsonb(OLD)) THEN RETURN OLD; END IF;
 IF OLD.status='completed' THEN RAISE EXCEPTION 'issued M03 receipt is immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION m03_protect_grant_terms() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' AND m04_erasing_row(to_jsonb(OLD)) THEN RETURN OLD; END IF;
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'revoked') IS DISTINCT FROM (to_jsonb(OLD)-'revoked') OR OLD.revoked OR NOT NEW.revoked THEN
  RAISE EXCEPTION 'M03 grant terms are immutable';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER m04_service_commands_immutable BEFORE UPDATE OR DELETE ON m04_service_commands FOR EACH ROW EXECUTE FUNCTION m03_reject_history_change();
