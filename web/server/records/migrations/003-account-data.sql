-- Keep only an anonymous period-held seat after a member exercises local deletion.
ALTER TABLE family_assignments ALTER COLUMN player_id DROP NOT NULL;
ALTER TABLE family_assignments DROP CONSTRAINT family_assignments_player_id_fkey;
ALTER TABLE family_assignments ADD CONSTRAINT family_assignments_player_id_fkey
  FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE SET NULL;
