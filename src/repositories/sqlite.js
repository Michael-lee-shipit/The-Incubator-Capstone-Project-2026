// Build 5: the same repository as memory.js, stored in SQLite.
// It only reads and writes. Every rule lives in the services (and the
// constraints in src/db/schema.sql).
//
// Every query uses ? placeholders, so a value can never be read as SQL.
// The statements are prepared once, when the repository is created.

import { openDatabase } from '../db/connection.js';

// Rows use snake_case columns; the rest of the app uses camelCase objects.
// Empty optional columns (NULL) are left out, the same as in memory.js.
function withoutNulls(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== null));
}

const toEvent = (row) =>
  row && {
    id: row.id,
    organizerId: row.organizer_id,
    title: row.title,
    city: row.city,
    venue: row.venue,
    startsAt: row.starts_at,
    status: row.status,
  };

const toTier = (row) =>
  row && {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    priceCents: row.price_cents,
    capacity: row.capacity,
    sold: row.sold,
  };

const toBooking = (row) =>
  row &&
  withoutNulls({
    id: row.id,
    reference: row.reference,
    userId: row.user_id,
    eventId: row.event_id,
    tierId: row.tier_id,
    quantity: row.quantity,
    amountCents: row.amount_cents,
    status: row.status,
    chargeId: row.charge_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    paidAt: row.paid_at,
    cancelledAt: row.cancelled_at,
    expiredAt: row.expired_at,
    refundAmountCents: row.refund_amount_cents,
    refundedAt: row.refunded_at,
  });

const toWaitlistEntry = (row) =>
  row && {
    id: row.id,
    tierId: row.tier_id,
    userId: row.user_id,
    quantity: row.quantity,
    status: row.status,
    createdAt: row.created_at,
  };

const toWaitlistOffer = (row) =>
  row &&
  withoutNulls({
    id: row.id,
    waitlistEntryId: row.waitlist_entry_id,
    userId: row.user_id,
    tierId: row.tier_id,
    quantity: row.quantity,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    expiredAt: row.expired_at,
  });

const toUser = (row) =>
  row && {
    id: row.id,
    email: row.email,
    role: row.role,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
  };

export function createSqliteRepository({ path, db = openDatabase(path) } = {}) {
  const sql = {
    ensureUser: db.prepare('INSERT OR IGNORE INTO users (id) VALUES (?)'),
    insertUser: db.prepare(
      'INSERT INTO users (id, email, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?)',
    ),
    findUserByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    findUserById: db.prepare('SELECT * FROM users WHERE id = ?'),

    insertEvent: db.prepare(
      `INSERT INTO events (id, organizer_id, title, city, venue, starts_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ),
    findEvent: db.prepare('SELECT * FROM events WHERE id = ?'),
    updateEvent: db.prepare(
      `UPDATE events SET title = ?, city = ?, venue = ?, starts_at = ?, status = ?
       WHERE id = ?`,
    ),
    listEvents: db.prepare('SELECT * FROM events ORDER BY rowid'),

    insertTier: db.prepare(
      `INSERT INTO ticket_tiers (id, event_id, name, price_cents, capacity, sold)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ),
    findTier: db.prepare('SELECT * FROM ticket_tiers WHERE id = ?'),
    updateTier: db.prepare(
      'UPDATE ticket_tiers SET name = ?, price_cents = ?, capacity = ?, sold = ? WHERE id = ?',
    ),
    listTiersForEvent: db.prepare('SELECT * FROM ticket_tiers WHERE event_id = ? ORDER BY rowid'),

    // THE OVERSELLING FIX. Checking for room and taking the seats happen in one
    // statement, so SQLite does both or neither. If two requests race for the
    // last seat, the second one finds `sold + ? <= capacity` is false and
    // changes no row.
    reserveSeats: db.prepare(
      'UPDATE ticket_tiers SET sold = sold + ? WHERE id = ? AND sold + ? <= capacity',
    ),
    releaseSeats: db.prepare('UPDATE ticket_tiers SET sold = sold - ? WHERE id = ? AND sold >= ?'),

    insertBooking: db.prepare(
      `INSERT INTO bookings (id, reference, user_id, event_id, tier_id, quantity, amount_cents,
                             status, charge_id, created_at, expires_at, paid_at, cancelled_at,
                             expired_at, refund_amount_cents, refunded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    findBookingByReference: db.prepare('SELECT * FROM bookings WHERE reference = ?'),
    listBookingsByUser: db.prepare('SELECT * FROM bookings WHERE user_id = ? ORDER BY rowid DESC'),
    updateBooking: db.prepare(
      `UPDATE bookings SET status = ?, charge_id = ?, paid_at = ?, cancelled_at = ?, expires_at = ?,
                           expired_at = ?, refund_amount_cents = ?, refunded_at = ?
       WHERE reference = ?`,
    ),
    compareAndSetBookingStatus: db.prepare(
      `UPDATE bookings SET status = ?, charge_id = ?, paid_at = ?, cancelled_at = ?, expires_at = ?,
                           expired_at = ?, refund_amount_cents = ?, refunded_at = ?
       WHERE reference = ? AND status = ?`,
    ),
    listPendingBookingsToExpire: db.prepare(
      `SELECT * FROM bookings
       WHERE status = 'pending'
         AND ((expires_at IS NOT NULL AND expires_at <= ?)
           OR (expires_at IS NULL AND created_at <= ?))
       ORDER BY created_at`,
    ),
    insertWaitlistEntry: db.prepare(
      `INSERT INTO waitlist_entries (id, tier_id, user_id, quantity, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ),
    findCurrentWaitlistEntry: db.prepare(
      `SELECT * FROM waitlist_entries
       WHERE tier_id = ? AND user_id = ? AND status IN ('waiting', 'offered')
       ORDER BY created_at LIMIT 1`,
    ),
    listWaitingEntriesForTier: db.prepare(
      `SELECT * FROM waitlist_entries WHERE tier_id = ? AND status = 'waiting' ORDER BY created_at, rowid`,
    ),
    compareAndSetWaitlistStatus: db.prepare(
      `UPDATE waitlist_entries SET status = ? WHERE id = ? AND status = ?`,
    ),
    insertWaitlistOffer: db.prepare(
      `INSERT INTO waitlist_offers
         (id, waitlist_entry_id, user_id, tier_id, quantity, status, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    findWaitlistOffer: db.prepare('SELECT * FROM waitlist_offers WHERE id = ?'),
    findActiveOfferForTier: db.prepare(
      `SELECT * FROM waitlist_offers WHERE tier_id = ? AND status = 'active' ORDER BY created_at LIMIT 1`,
    ),
    listActiveOffersForUser: db.prepare(
      `SELECT * FROM waitlist_offers WHERE user_id = ? AND status = 'active' ORDER BY created_at`,
    ),
    listExpiredActiveOffers: db.prepare(
      `SELECT * FROM waitlist_offers WHERE status = 'active' AND expires_at <= ? ORDER BY expires_at`,
    ),
    compareAndSetOfferStatus: db.prepare(
      `UPDATE waitlist_offers SET status = ?, accepted_at = ?, expired_at = ?
       WHERE id = ? AND status = ?`,
    ),
  };

  const findEvent = (id) => toEvent(sql.findEvent.get(id));
  const findTier = (id) => toTier(sql.findTier.get(id));
  const findBooking = (reference) => toBooking(sql.findBookingByReference.get(reference));

  return {
    async createUser(user) {
      sql.insertUser.run(user.id, user.email, user.role, user.passwordHash, user.createdAt);
      return toUser(sql.findUserById.get(user.id));
    },
    async findUserByEmail(email) {
      return toUser(sql.findUserByEmail.get(email));
    },
    async findUserById(id) {
      return toUser(sql.findUserById.get(id));
    },

    async insertEvent(event) {
      sql.ensureUser.run(event.organizerId);
      sql.insertEvent.run(
        event.id,
        event.organizerId,
        event.title,
        event.city,
        event.venue,
        event.startsAt,
        event.status,
      );
      return findEvent(event.id);
    },
    async findEvent(id) {
      return findEvent(id);
    },
    async updateEvent(event) {
      sql.updateEvent.run(event.title, event.city, event.venue, event.startsAt, event.status, event.id);
      return findEvent(event.id);
    },
    async listEvents() {
      return sql.listEvents.all().map(toEvent);
    },

    async insertTier(tier) {
      sql.insertTier.run(tier.id, tier.eventId, tier.name, tier.priceCents, tier.capacity, tier.sold);
      return findTier(tier.id);
    },
    async findTier(id) {
      return findTier(id);
    },
    async updateTier(tier) {
      sql.updateTier.run(tier.name, tier.priceCents, tier.capacity, tier.sold, tier.id);
      return findTier(tier.id);
    },
    async listTiersForEvent(eventId) {
      return sql.listTiersForEvent.all(eventId).map(toTier);
    },

    // true if the seats were taken, false if there was not enough room.
    async reserveSeats(tierId, quantity) {
      return sql.reserveSeats.run(quantity, tierId, quantity).changes === 1;
    },
    // true if the seats were given back.
    async releaseSeats(tierId, quantity) {
      return sql.releaseSeats.run(quantity, tierId, quantity).changes === 1;
    },

    async insertBooking(booking) {
      sql.ensureUser.run(booking.userId);
      sql.insertBooking.run(
        booking.id,
        booking.reference,
        booking.userId,
        booking.eventId,
        booking.tierId,
        booking.quantity,
        booking.amountCents,
        booking.status,
        booking.chargeId ?? null,
        booking.createdAt,
        booking.expiresAt ?? null,
        booking.paidAt ?? null,
        booking.cancelledAt ?? null,
        booking.expiredAt ?? null,
        booking.refundAmountCents ?? null,
        booking.refundedAt ?? null,
      );
      return findBooking(booking.reference);
    },
    async findBookingByReference(reference) {
      return findBooking(reference);
    },
    async listBookingsByUser(userId) {
      return sql.listBookingsByUser.all(userId).map(toBooking);
    },
    async updateBooking(booking) {
      sql.updateBooking.run(
        booking.status,
        booking.chargeId ?? null,
        booking.paidAt ?? null,
        booking.cancelledAt ?? null,
        booking.expiresAt ?? null,
        booking.expiredAt ?? null,
        booking.refundAmountCents ?? null,
        booking.refundedAt ?? null,
        booking.reference,
      );
      return findBooking(booking.reference);
    },
    async compareAndSetBookingStatus(reference, expectedStatus, booking) {
      const result = sql.compareAndSetBookingStatus.run(
        booking.status,
        booking.chargeId ?? null,
        booking.paidAt ?? null,
        booking.cancelledAt ?? null,
        booking.expiresAt ?? null,
        booking.expiredAt ?? null,
        booking.refundAmountCents ?? null,
        booking.refundedAt ?? null,
        reference,
        expectedStatus,
      );
      return result.changes === 1 ? findBooking(reference) : null;
    },
    async listPendingBookingsToExpire(now, fallbackCutoff) {
      return sql.listPendingBookingsToExpire.all(now, fallbackCutoff).map(toBooking);
    },

    async createWaitlistEntry(entry) {
      sql.insertWaitlistEntry.run(
        entry.id,
        entry.tierId,
        entry.userId,
        entry.quantity,
        entry.status,
        entry.createdAt,
      );
      return toWaitlistEntry(
        db.prepare('SELECT * FROM waitlist_entries WHERE id = ?').get(entry.id),
      );
    },
    async findCurrentWaitlistEntry(tierId, userId) {
      return toWaitlistEntry(sql.findCurrentWaitlistEntry.get(tierId, userId));
    },
    async listWaitingEntriesForTier(tierId) {
      return sql.listWaitingEntriesForTier.all(tierId).map(toWaitlistEntry);
    },
    async compareAndSetWaitlistStatus(id, expectedStatus, status) {
      const result = sql.compareAndSetWaitlistStatus.run(status, id, expectedStatus);
      if (result.changes !== 1) return null;
      return toWaitlistEntry(db.prepare('SELECT * FROM waitlist_entries WHERE id = ?').get(id));
    },
    async createWaitlistOffer(offer) {
      sql.insertWaitlistOffer.run(
        offer.id,
        offer.waitlistEntryId,
        offer.userId,
        offer.tierId,
        offer.quantity,
        offer.status,
        offer.createdAt,
        offer.expiresAt,
      );
      return toWaitlistOffer(sql.findWaitlistOffer.get(offer.id));
    },
    async findWaitlistOffer(id) {
      return toWaitlistOffer(sql.findWaitlistOffer.get(id));
    },
    async findActiveOfferForTier(tierId) {
      return toWaitlistOffer(sql.findActiveOfferForTier.get(tierId));
    },
    async listActiveOffersForUser(userId) {
      return sql.listActiveOffersForUser.all(userId).map(toWaitlistOffer);
    },
    async listExpiredActiveOffers(before) {
      return sql.listExpiredActiveOffers.all(before).map(toWaitlistOffer);
    },
    async compareAndSetOfferStatus(id, expectedStatus, status, extra = {}) {
      const result = sql.compareAndSetOfferStatus.run(
        status,
        extra.acceptedAt ?? null,
        extra.expiredAt ?? null,
        id,
        expectedStatus,
      );
      return result.changes === 1 ? toWaitlistOffer(sql.findWaitlistOffer.get(id)) : null;
    },

    close() {
      if (db.isOpen) db.close();
    },
  };
}
