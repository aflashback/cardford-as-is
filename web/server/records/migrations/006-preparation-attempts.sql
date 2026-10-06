-- V1 prepared work has an immutable result per issued receipt. jobs remains the
-- unique current (game, revision) pointer; superseded receipts stay here.
CREATE TABLE preparation_attempts (
  id uuid PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  access_generation integer NOT NULL,
  control_token text,
  status text NOT NULL CHECK(status IN ('computing','ready','rejected')),
  result jsonb,
  expires_at timestamptz NOT NULL,
  CHECK ((status='ready' AND result IS NOT NULL) OR status<>'ready')
);
CREATE UNIQUE INDEX one_computing_preparation ON preparation_attempts(game_id,revision)
  WHERE status='computing';
