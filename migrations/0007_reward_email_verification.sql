BEGIN;

ALTER TABLE users
  ADD COLUMN reward_email_verified_at timestamptz,
  ADD COLUMN reward_email_verification_token_hash text CHECK (reward_email_verification_token_hash IS NULL OR length(reward_email_verification_token_hash) = 64),
  ADD COLUMN reward_email_verification_expires_at timestamptz;

INSERT INTO schema_migrations(version) VALUES ('0007_reward_email_verification')
ON CONFLICT DO NOTHING;

COMMIT;
