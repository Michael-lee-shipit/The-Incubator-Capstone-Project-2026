// Build 4: a repository that keeps everything in memory.
// It only reads and writes. Every rule lives in the services.
// Build 5 adds src/repositories/sqlite.js with the same async methods. The
// server uses SQLite; this one stays for fast tests and comparison.
//
// Records are copied in and out, so a caller can never change stored data by
// editing an object it was handed. That is how a real database behaves too.

const copy = (record) => (record === undefined ? undefined : structuredClone(record));

export function createMemoryRepository() {
  const events = new Map(); // eventId -> event
  const tiers = new Map(); // tierId -> tier
  const bookings = new Map(); // reference -> booking  (O(1) lookup by reference)
  const users = new Map(); // userId -> user
  const userIdsByEmail = new Map(); // normalized email -> userId
  const waitlistEntries = new Map();
  const waitlistOffers = new Map();

  return {
    async createUser(user) {
      if (userIdsByEmail.has(user.email)) {
        const error = new Error('UNIQUE constraint failed: users.email');
        error.code = 'ERR_SQLITE_CONSTRAINT_UNIQUE';
        throw error;
      }
      users.set(user.id, copy(user));
      userIdsByEmail.set(user.email, user.id);
      return copy(user);
    },
    async findUserByEmail(email) {
      const id = userIdsByEmail.get(email);
      return copy(users.get(id));
    },
    async findUserById(id) {
      return copy(users.get(id));
    },

    async insertEvent(event) {
      events.set(event.id, copy(event));
      return copy(event);
    },
    async findEvent(id) {
      return copy(events.get(id));
    },
    async updateEvent(event) {
      events.set(event.id, copy(event));
      return copy(event);
    },
    async listEvents() {
      return [...events.values()].map(copy);
    },

    async insertTier(tier) {
      tiers.set(tier.id, copy(tier));
      return copy(tier);
    },
    async findTier(id) {
      return copy(tiers.get(id));
    },
    async updateTier(tier) {
      tiers.set(tier.id, copy(tier));
      return copy(tier);
    },
    async listTiersForEvent(eventId) {
      return [...tiers.values()].filter((tier) => tier.eventId === eventId).map(copy);
    },

    // The same contract as sqlite.js: check and take the seats in one step.
    // There is no `await` between the check and the change, and JavaScript
    // runs one piece of code at a time, so no other request can get in between.
    async reserveSeats(tierId, quantity) {
      const tier = tiers.get(tierId);
      if (!tier || tier.sold + quantity > tier.capacity) return false;
      tier.sold += quantity;
      return true;
    },
    async releaseSeats(tierId, quantity) {
      const tier = tiers.get(tierId);
      if (!tier || tier.sold < quantity) return false;
      tier.sold -= quantity;
      return true;
    },

    async insertBooking(booking) {
      bookings.set(booking.reference, copy(booking));
      return copy(booking);
    },
    async findBookingByReference(reference) {
      return copy(bookings.get(reference));
    },
    async listBookingsByUser(userId) {
      return [...bookings.values()].filter((booking) => booking.userId === userId).map(copy);
    },
    async updateBooking(booking) {
      bookings.set(booking.reference, copy(booking));
      return copy(booking);
    },
    async compareAndSetBookingStatus(reference, expectedStatus, booking) {
      const current = bookings.get(reference);
      if (!current || current.status !== expectedStatus) return null;
      bookings.set(reference, copy(booking));
      return copy(booking);
    },
    async listPendingBookingsToExpire(now, fallbackCutoff) {
      return [...bookings.values()]
        .filter((booking) => booking.status === 'pending')
        .filter((booking) =>
          booking.expiresAt ? booking.expiresAt <= now : booking.createdAt <= fallbackCutoff,
        )
        .map(copy);
    },

    async createWaitlistEntry(entry) {
      waitlistEntries.set(entry.id, copy(entry));
      return copy(entry);
    },
    async findCurrentWaitlistEntry(tierId, userId) {
      return copy(
        [...waitlistEntries.values()].find(
          (entry) =>
            entry.tierId === tierId &&
            entry.userId === userId &&
            ['waiting', 'offered'].includes(entry.status),
        ),
      );
    },
    async listWaitingEntriesForTier(tierId) {
      return [...waitlistEntries.values()]
        .filter((entry) => entry.tierId === tierId && entry.status === 'waiting')
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
        .map(copy);
    },
    async compareAndSetWaitlistStatus(id, expectedStatus, status) {
      const entry = waitlistEntries.get(id);
      if (!entry || entry.status !== expectedStatus) return null;
      const updated = { ...entry, status };
      waitlistEntries.set(id, updated);
      return copy(updated);
    },
    async createWaitlistOffer(offer) {
      waitlistOffers.set(offer.id, copy(offer));
      return copy(offer);
    },
    async findWaitlistOffer(id) {
      return copy(waitlistOffers.get(id));
    },
    async findActiveOfferForTier(tierId) {
      return copy([...waitlistOffers.values()].find((offer) => offer.tierId === tierId && offer.status === 'active'));
    },
    async listActiveOffersForUser(userId) {
      return [...waitlistOffers.values()]
        .filter((offer) => offer.userId === userId && offer.status === 'active')
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
        .map(copy);
    },
    async listExpiredActiveOffers(before) {
      return [...waitlistOffers.values()]
        .filter((offer) => offer.status === 'active' && offer.expiresAt <= before)
        .map(copy);
    },
    async compareAndSetOfferStatus(id, expectedStatus, status, extra = {}) {
      const offer = waitlistOffers.get(id);
      if (!offer || offer.status !== expectedStatus) return null;
      const updated = { ...offer, ...extra, status };
      waitlistOffers.set(id, updated);
      return copy(updated);
    },

    close() {},
  };
}
