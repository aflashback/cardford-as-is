CREATE TABLE analysis_jobs (
  id uuid PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  command_id text NOT NULL,
  digest text NOT NULL,
  revision integer NOT NULL,
  access_generation integer NOT NULL,
  seed integer NOT NULL,
  status text NOT NULL CHECK(status IN ('queued','ready','unavailable','expired')),
  result jsonb,
  expires_at timestamptz NOT NULL,
  UNIQUE(player_id,command_id)
);
CREATE UNIQUE INDEX one_pending_analysis_per_player ON analysis_jobs(player_id) WHERE status='queued';
