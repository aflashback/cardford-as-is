-- PL-F04/F08: PostgreSQL owns foreground and pause deadlines. Existing games
-- retain their historical policy until an explicit Resume adopts pause-v1.
ALTER TABLE m05_playback DROP CONSTRAINT m05_playback_generation_check;
ALTER TABLE m05_playback ADD CHECK(generation BETWEEN 0 AND 9007199254740991);
ALTER TABLE m05_playback ADD COLUMN phase text NOT NULL DEFAULT 'paused' CHECK (phase IN ('running','held','paused','expired','completed'));
ALTER TABLE m05_playback ADD COLUMN policy_version text NOT NULL DEFAULT 'legacy' CHECK (policy_version IN ('legacy','pause-v1'));
ALTER TABLE m05_playback ADD COLUMN pause_reason text;
ALTER TABLE m05_playback ADD COLUMN foreground_lease_until timestamptz;
ALTER TABLE m05_playback ADD COLUMN paused_at timestamptz;
ALTER TABLE m05_playback ADD COLUMN expires_at timestamptz;
ALTER TABLE m05_playback ADD COLUMN presence_sequence bigint NOT NULL DEFAULT 0 CHECK (presence_sequence BETWEEN 0 AND 9007199254740991);
ALTER TABLE m05_playback ADD COLUMN retention_seconds integer NOT NULL DEFAULT 300 CHECK (retention_seconds BETWEEN 1 AND 86400);
ALTER TABLE m05_playback ADD COLUMN game_kind text NOT NULL DEFAULT '';
ALTER TABLE m05_playback ADD COLUMN variant_kind text NOT NULL DEFAULT '';
UPDATE m05_playback SET phase=CASE WHEN running THEN 'running' ELSE 'paused' END;
CREATE INDEX m06_foreground_due ON m05_playback(foreground_lease_until,owner_id) WHERE policy_version='pause-v1' AND phase IN ('running','held');
CREATE INDEX m06_retention_due ON m05_playback(expires_at,owner_id) WHERE policy_version='pause-v1' AND phase='paused';
CREATE INDEX m06_expired_owner ON m05_playback(owner_id,expires_at DESC) WHERE phase='expired';
-- Presence renewals are quiet: they do not enqueue a full game projection.
DROP TRIGGER m05_playback_changed ON m05_playback;
CREATE TRIGGER m05_playback_inserted AFTER INSERT ON m05_playback FOR EACH ROW EXECUTE FUNCTION m05_realtime_change();
CREATE TRIGGER m05_playback_changed AFTER UPDATE ON m05_playback FOR EACH ROW
WHEN ((NEW.generation,NEW.phase) IS DISTINCT FROM (OLD.generation,OLD.phase)) EXECUTE FUNCTION m05_realtime_change();
