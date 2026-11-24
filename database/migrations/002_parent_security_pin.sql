-- Migration 002: Parent Security PIN & Anti-Tamper Shield
-- Compatible with PostgreSQL 13+ and PGlite

ALTER TABLE users ADD COLUMN IF NOT EXISTS security_pin_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_failed_attempts INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_locked_until TIMESTAMP WITH TIME ZONE;

-- Seed default PIN ('1234') for demo parent account if it exists and has no PIN
UPDATE users 
SET security_pin_hash = '$2a$10$5RmZK6KeWj3sZ.IeLyzJgOM6FX3U90UupJRPT0H7uTaOjx3Yf9avO' 
WHERE email = 'parent@example.com' AND security_pin_hash IS NULL;
