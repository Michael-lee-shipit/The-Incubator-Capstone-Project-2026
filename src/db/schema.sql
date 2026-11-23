-- Build 5: the database schema. Run by src/db/connection.js every time it
-- opens a database. Every statement is IF NOT EXISTS, so running it again on a
-- database that already has data changes nothing.
--
-- The rules that must never be broken live here as constraints, so even a bug
-- in the JavaScript cannot store a booking for a tier that does not exist, or
-- sell more seats than a tier has.

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  name        TEXT,
  email       TEXT UNIQUE,
  role        TEXT CHECK (role IN ('organizer', 'attendee', 'staff')),
  password_hash TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS events (
  id            TEXT PRIMARY KEY,
  organizer_id  TEXT NOT NULL REFERENCES users (id),
  title         TEXT NOT NULL CHECK (length(trim(title)) > 0),
  city          TEXT NOT NULL CHECK (length(trim(city)) > 0),
  venue         TEXT NOT NULL DEFAULT '',
  starts_at     TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published'))
);

CREATE TABLE IF NOT EXISTS ticket_tiers (
  id           TEXT PRIMARY KEY,
  event_id     TEXT NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  name         TEXT NOT NULL CHECK (length(trim(name)) > 0),
  -- Money is always whole cents.
  price_cents  INTEGER NOT NULL CHECK (typeof(price_cents) = 'integer' AND price_cents >= 0),
  capacity     INTEGER NOT NULL CHECK (typeof(capacity) = 'integer' AND capacity >= 1),
  sold         INTEGER NOT NULL DEFAULT 0,
  -- The last line of defence against overselling.
  CHECK (sold >= 0 AND sold <= capacity)
);

CREATE TABLE IF NOT EXISTS bookings (
  id            TEXT PRIMARY KEY,
  reference     TEXT NOT NULL UNIQUE,
  user_id       TEXT NOT NULL REFERENCES users (id),
  event_id      TEXT NOT NULL REFERENCES events (id),
  tier_id       TEXT NOT NULL REFERENCES ticket_tiers (id),
  quantity      INTEGER NOT NULL CHECK (typeof(quantity) = 'integer' AND quantity BETWEEN 1 AND 10),
  amount_cents  INTEGER NOT NULL CHECK (typeof(amount_cents) = 'integer' AND amount_cents >= 0),
  status        TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'cancelled', 'refunded', 'checked_in')),
  charge_id     TEXT,
  created_at    TEXT NOT NULL,
  expires_at    TEXT,
  paid_at       TEXT,
  cancelled_at  TEXT,
  expired_at    TEXT,
  refund_amount_cents INTEGER CHECK (refund_amount_cents IS NULL OR (typeof(refund_amount_cents) = 'integer' AND refund_amount_cents >= 0)),
  refunded_at   TEXT
);

CREATE TABLE IF NOT EXISTS waitlist_entries (
  id            TEXT PRIMARY KEY,
  tier_id       TEXT NOT NULL REFERENCES ticket_tiers (id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users (id),
  quantity      INTEGER NOT NULL CHECK (typeof(quantity) = 'integer' AND quantity BETWEEN 1 AND 10),
  status        TEXT NOT NULL CHECK (status IN ('waiting', 'offered', 'fulfilled', 'expired')),
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS waitlist_entries_queue ON waitlist_entries (tier_id, status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_entries_active_user
  ON waitlist_entries (tier_id, user_id) WHERE status IN ('waiting', 'offered');

CREATE TABLE IF NOT EXISTS waitlist_offers (
  id                  TEXT PRIMARY KEY,
  waitlist_entry_id   TEXT NOT NULL REFERENCES waitlist_entries (id),
  user_id             TEXT NOT NULL REFERENCES users (id),
  tier_id             TEXT NOT NULL REFERENCES ticket_tiers (id),
  quantity            INTEGER NOT NULL CHECK (typeof(quantity) = 'integer' AND quantity BETWEEN 1 AND 10),
  status              TEXT NOT NULL CHECK (status IN ('active', 'accepted', 'expired')),
  created_at          TEXT NOT NULL,
  expires_at          TEXT NOT NULL,
  accepted_at         TEXT,
  expired_at          TEXT
);

CREATE INDEX IF NOT EXISTS waitlist_offers_tier_status ON waitlist_offers (tier_id, status);
CREATE INDEX IF NOT EXISTS waitlist_offers_user_status ON waitlist_offers (user_id, status);

CREATE INDEX IF NOT EXISTS ticket_tiers_event_id ON ticket_tiers (event_id);
CREATE INDEX IF NOT EXISTS bookings_tier_id ON bookings (tier_id);
CREATE INDEX IF NOT EXISTS bookings_user_id ON bookings (user_id);
