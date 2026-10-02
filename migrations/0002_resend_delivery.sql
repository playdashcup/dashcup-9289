BEGIN;

ALTER TABLE reward_redemptions
  ADD COLUMN delivery_status text NOT NULL DEFAULT 'reserved'
    CHECK (delivery_status IN ('reserved','accepted','sent','rejected','provider_unknown')),
  ADD COLUMN delivery_updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE resend_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  event_created_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations(version) VALUES ('0002_resend_delivery')
ON CONFLICT DO NOTHING;

COMMIT;
