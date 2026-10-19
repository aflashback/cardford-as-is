-- Local receive-only realtime. Only allowlisted seat-zero projections enter
-- this derived cache/outbox; private documents and decisions remain separate.
CREATE TABLE m05_realtime_streams (
 owner_id text PRIMARY KEY REFERENCES m03_access(owner_id) ON DELETE CASCADE,
 sequence bigint NOT NULL DEFAULT 0 CHECK(sequence BETWEEN 0 AND 9007199254740991),
 purged_through bigint NOT NULL DEFAULT 0 CHECK(purged_through BETWEEN 0 AND sequence)
);
CREATE TABLE m05_realtime_projections (
 game_id text PRIMARY KEY REFERENCES m03_games(game_id) ON DELETE CASCADE,
 owner_id text NOT NULL REFERENCES m03_access(owner_id) ON DELETE CASCADE,
 revision bigint NOT NULL CHECK(revision BETWEEN 0 AND 9007199254740991),
 projection bytea NOT NULL CHECK(octet_length(projection)<=2097152)
);
CREATE TABLE m05_playback (
 game_id text PRIMARY KEY REFERENCES m03_games(game_id) ON DELETE CASCADE,
 owner_id text NOT NULL REFERENCES m03_access(owner_id) ON DELETE CASCADE,
 running boolean NOT NULL,
 generation bigint NOT NULL CHECK(generation BETWEEN 1 AND 9007199254740991),
 control_generation bigint NOT NULL,
 instance_id text NOT NULL
);
CREATE TABLE m05_realtime_outbox (
 owner_id text NOT NULL REFERENCES m05_realtime_streams(owner_id) ON DELETE CASCADE,
 sequence bigint NOT NULL,
 kind text NOT NULL CHECK(kind IN ('session','access','control','work','review','playback')),
 game_id text NOT NULL DEFAULT '',
 revision bigint NOT NULL DEFAULT 0,
 work_id text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT '',
 access_generation bigint NOT NULL,
 control_generation bigint NOT NULL,
 projection bytea CHECK(projection IS NULL OR octet_length(projection)<=2097152),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 lease_token text,
 lease_until timestamptz,
 attempt bigint NOT NULL DEFAULT 0,
 delivered_at timestamptz,
 PRIMARY KEY(owner_id,sequence)
);
CREATE INDEX m05_realtime_pending ON m05_realtime_outbox(available_at,created_at) WHERE delivered_at IS NULL;

CREATE FUNCTION m05_realtime_append(owner_value text, kind_value text, game_value text DEFAULT '', revision_value bigint DEFAULT 0, work_value text DEFAULT '', status_value text DEFAULT '', projection_value bytea DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
DECLARE seq bigint; access_value bigint; control_value bigint;
BEGIN
 IF current_setting('cardford.erasing_owner',true)=owner_value THEN RETURN; END IF;
 SELECT generation,control_generation INTO access_value,control_value FROM m03_access WHERE owner_id=owner_value;
 IF NOT FOUND THEN RETURN; END IF;
 INSERT INTO m05_realtime_streams(owner_id) VALUES(owner_value) ON CONFLICT DO NOTHING;
 UPDATE m05_realtime_streams SET sequence=sequence+1 WHERE owner_id=owner_value RETURNING sequence INTO seq;
 INSERT INTO m05_realtime_outbox(owner_id,sequence,kind,game_id,revision,work_id,status,access_generation,control_generation,projection)
 VALUES(owner_value,seq,kind_value,COALESCE(game_value,''),revision_value,work_value,status_value,access_value,control_value,projection_value);
 -- This is a bounded delivery/reconnect window, not a second game journal.
 -- Overflow advances the durable gap boundary even for undelivered rows.
 IF seq>512 THEN
  DELETE FROM m05_realtime_outbox WHERE owner_id=owner_value AND sequence<=seq-512;
  UPDATE m05_realtime_streams SET purged_through=GREATEST(purged_through,seq-512) WHERE owner_id=owner_value;
 END IF;
END;
$$;
CREATE FUNCTION m05_realtime_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_revision bigint; current_projection bytea;
BEGIN
 IF TG_TABLE_NAME='m05_realtime_projections' THEN
  PERFORM m05_realtime_append(NEW.owner_id,'session',NEW.game_id,NEW.revision,'','',NEW.projection);
 ELSIF TG_TABLE_NAME='m03_access' THEN
  IF (NEW.generation,NEW.control_generation,NEW.active_game_id,NEW.can_read,NEW.can_play,NEW.can_coach) IS DISTINCT FROM (OLD.generation,OLD.control_generation,OLD.active_game_id,OLD.can_read,OLD.can_play,OLD.can_coach) THEN
   PERFORM m05_realtime_append(NEW.owner_id,CASE WHEN NEW.control_generation<>OLD.control_generation THEN 'control' ELSE 'access' END,NEW.active_game_id);
  END IF;
 ELSIF TG_TABLE_NAME='m04_sessions' THEN
  IF (NEW.revoked_at,NEW.expires_at) IS DISTINCT FROM (OLD.revoked_at,OLD.expires_at) THEN
   PERFORM m05_realtime_append(NEW.owner_id,'access');
  END IF;
 ELSIF TG_TABLE_NAME='m03_work' THEN
  IF NEW.status IN ('completed','rejected','canceled') AND NEW.status IS DISTINCT FROM OLD.status THEN
   PERFORM m05_realtime_append(NEW.owner_id,'work',NEW.game_id,NEW.revision,NEW.work_id,NEW.status);
  END IF;
 ELSIF TG_TABLE_NAME='m04_review_jobs' THEN
  IF NEW.status IN ('completed','expired','unavailable') AND NEW.status IS DISTINCT FROM OLD.status THEN
   PERFORM m05_realtime_append(NEW.owner_id,'review',NEW.game_id,NEW.live_revision,NEW.command_id,NEW.status);
  END IF;
 ELSIF TG_TABLE_NAME='m05_playback' THEN
  SELECT revision,projection INTO current_revision,current_projection FROM m05_realtime_projections WHERE game_id=NEW.game_id AND owner_id=NEW.owner_id;
  PERFORM m05_realtime_append(NEW.owner_id,'playback',NEW.game_id,COALESCE(current_revision,0),'',CASE WHEN NEW.running THEN 'running' ELSE 'paused' END,current_projection);
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER m05_projection_changed AFTER INSERT OR UPDATE ON m05_realtime_projections FOR EACH ROW EXECUTE FUNCTION m05_realtime_change();
CREATE TRIGGER m05_access_changed AFTER UPDATE ON m03_access FOR EACH ROW EXECUTE FUNCTION m05_realtime_change();
CREATE TRIGGER m05_session_changed AFTER UPDATE ON m04_sessions FOR EACH ROW EXECUTE FUNCTION m05_realtime_change();
CREATE TRIGGER m05_work_changed AFTER UPDATE ON m03_work FOR EACH ROW EXECUTE FUNCTION m05_realtime_change();
CREATE TRIGGER m05_review_changed AFTER UPDATE ON m04_review_jobs FOR EACH ROW EXECUTE FUNCTION m05_realtime_change();
CREATE TRIGGER m05_playback_changed AFTER INSERT OR UPDATE ON m05_playback FOR EACH ROW EXECUTE FUNCTION m05_realtime_change();
