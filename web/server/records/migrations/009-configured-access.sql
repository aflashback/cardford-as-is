-- MG-16: configured identities are explicitly separate from M04C fixtures.
ALTER TABLE m03_access ADD COLUMN configured_offers boolean NOT NULL DEFAULT false;

-- One original coaching allowance reservation per module-defined unit,
-- independent of later selected grants, buckets, periods or offer versions.
CREATE TABLE m04_coaching_unlocks (
 owner_id text NOT NULL REFERENCES m03_access(owner_id),
 game_id text NOT NULL REFERENCES m03_games(game_id),
 unit_id text NOT NULL,
 grant_id text NOT NULL REFERENCES m03_grants(grant_id),
 bucket_id text NOT NULL,
 period_key text NOT NULL,
 offer_id text NOT NULL,
 offer_version text NOT NULL,
 command_id text NOT NULL,
 unlocked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(owner_id,game_id,unit_id),
 FOREIGN KEY(owner_id,command_id) REFERENCES m03_allowance_charges(owner_id,command_id)
);
-- Preserve legacy reservations without rewriting any accepted charge. Legacy
-- buckets could permit multiple reservations for one unit. The first recorded
-- command revision is retained; imported charges without a command use their
-- stable command ID as a deterministic final tie breaker. All charged usage
-- remains in its original ledger, including any historical duplicate charges.
INSERT INTO m04_coaching_unlocks(owner_id,game_id,unit_id,grant_id,bucket_id,period_key,offer_id,offer_version,command_id)
SELECT DISTINCT ON (c.owner_id,c.game_id,c.unit_id)
 c.owner_id,c.game_id,c.unit_id,c.grant_id,c.bucket_id,c.period_key,c.offer_id,c.offer_version,c.command_id
FROM m03_allowance_charges c
JOIN m03_games g ON g.game_id=c.game_id AND g.owner_id=c.owner_id
LEFT JOIN m03_commands cmd ON cmd.owner_id=c.owner_id AND cmd.command_id=c.command_id
ORDER BY c.owner_id,c.game_id,c.unit_id,COALESCE(cmd.revision,9223372036854775807),c.command_id;
CREATE TRIGGER m04_unlocks_immutable BEFORE UPDATE OR DELETE ON m04_coaching_unlocks FOR EACH ROW EXECUTE FUNCTION m03_reject_history_change();
