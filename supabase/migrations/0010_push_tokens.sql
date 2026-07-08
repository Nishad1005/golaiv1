-- Golai v1.0 — Migration 0010: device push tokens (FCM via Capacitor)
-- The mobile app registers its FCM token here; an Edge Function (deployment
-- step) sends pushes for new alerts to each notified user's devices.

alter table profiles add column if not exists push_token text;
alter table profiles add column if not exists push_token_updated_at timestamptz;
