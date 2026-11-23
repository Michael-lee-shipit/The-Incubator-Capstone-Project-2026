import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRefund, DAY_MS } from '../src/domain/refundPolicy.js';
import { createClock } from '../src/lib/clock.js';
import { createMockPaymentGateway } from '../src/lib/mockPaymentGateway.js';
import { createMemoryRepository } from '../src/repositories/memory.js';
import { createBookingService } from '../src/services/bookingService.js';
import { createEventService } from '../src/services/eventService.js';
import { createMaintenanceJob } from '../src/jobs/maintenance.js';
import { createSeatService } from '../src/services/seatService.js';
import { createWaitlistService } from '../src/services/waitlistService.js';

const START = new Date('2027-01-01T12:00:00.000Z');

test('refund policy assigns exact boundaries to the better tier and floors cents', () => {
  const startsAt = START.toISOString();
  const amountCents = 101;
  const atDaysBefore = (days, extraHours = 0) =>
    new Date(START.getTime() - days * DAY_MS - extraHours * 60 * 60 * 1000);

  assert.equal(calculateRefund({ amountCents, startsAt, now: atDaysBefore(7) }).amountCents, 101);
  assert.equal(calculateRefund({ amountCents, startsAt, now: atDaysBefore(6, 23) }).amountCents, 50);
  assert.equal(calculateRefund({ amountCents, startsAt, now: atDaysBefore(2) }).amountCents, 50);
  assert.equal(calculateRefund({ amountCents, startsAt, now: atDaysBefore(1, 23) }).amountCents, 0);
  assert.throws(
    () => calculateRefund({ amountCents, startsAt, now: START }),
    (error) => error.code === 'EVENT_STARTED',
  );
});

async function createFixture({ eventDaysAway = 10, capacity = 1, holdMs, offerMs } = {}) {
  const clock = createClock(new Date('2026-12-01T12:00:00.000Z'));
  const repository = createMemoryRepository();
  const paymentGateway = createMockPaymentGateway();
  const seatService = createSeatService({ repository });
  let bookingService;
  const waitlistService = createWaitlistService({
    repository,
    seatService,
    clock,
    offerHoldMs: offerMs,
    createBooking: (userId, offer) => bookingService.bookFromHeldSeats(userId, offer),
  });
  bookingService = createBookingService({
    repository,
    paymentGateway,
    clock,
    seatService,
    waitlistService,
    holdMs,
  });
  const eventService = createEventService({ repository });

  const users = ['organizer', 'booker', 'waiter-a', 'waiter-b', 'waiter-c'];
  for (const id of users) {
    await repository.createUser({
      id,
      email: `${id}@example.test`,
      role: id === 'organizer' ? 'organizer' : 'attendee',
      passwordHash: 'test',
      createdAt: clock.now().toISOString(),
    });
  }
  const event = await eventService.createEvent('organizer', {
    title: 'Build 8 Event',
    city: 'Lagos',
    venue: 'Test Venue',
    startsAt: new Date(clock.now().getTime() + eventDaysAway * DAY_MS).toISOString(),
  });
  const tier = await eventService.addTier('organizer', event.id, {
    name: 'General',
    priceCents: 101,
    capacity,
  });
  await eventService.publishEvent('organizer', event.id);
  return { clock, repository, paymentGateway, seatService, waitlistService, bookingService, event, tier };
}

test('paid cancellation applies refund and concurrent repeat cancellation releases seats once', async () => {
  const { bookingService, repository, tier, paymentGateway } = await createFixture();
  const booking = await bookingService.book('booker', { tierId: tier.id, quantity: 1 });
  await bookingService.pay('booker', booking.reference, { paymentToken: 'tok_success' });

  const cancellations = await Promise.allSettled([
    bookingService.cancel('booker', booking.reference),
    bookingService.cancel('booker', booking.reference),
  ]);
  assert.equal(cancellations.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(cancellations.filter((result) => result.status === 'rejected').length, 1);
  assert.equal((await repository.findTier(tier.id)).sold, 0);
  assert.equal(paymentGateway.refundCount, 1);
  assert.equal((await repository.findBookingByReference(booking.reference)).refundAmountCents, 101);
});

test('zero-refund cancellation still releases seats without calling the gateway', async () => {
  const { bookingService, repository, tier, paymentGateway } = await createFixture({ eventDaysAway: 1 });
  const booking = await bookingService.book('booker', { tierId: tier.id, quantity: 1 });
  await bookingService.pay('booker', booking.reference, { paymentToken: 'tok_success' });
  const cancelled = await bookingService.cancel('booker', booking.reference);
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.refundAmountCents, 0);
  assert.equal((await repository.findTier(tier.id)).sold, 0);
  assert.equal(paymentGateway.refundCount, 0);
});

test('waitlist rejects available tiers and duplicate attendees', async () => {
  const { waitlistService, bookingService, tier } = await createFixture();
  await assert.rejects(
    waitlistService.join('waiter-a', { tierId: tier.id, quantity: 1 }),
    (error) => error.code === 'NOT_SOLD_OUT',
  );
  const booking = await bookingService.book('booker', { tierId: tier.id, quantity: 1 });
  await waitlistService.join('waiter-a', { tierId: tier.id, quantity: 1 });
  await assert.rejects(
    waitlistService.join('waiter-a', { tierId: tier.id, quantity: 1 }),
    (error) => error.code === 'ALREADY_ON_WAITLIST',
  );
  await bookingService.pay('booker', booking.reference, { paymentToken: 'tok_success' });
});

test('waitlist offers seats in FIFO order, expires the first offer, and accepts the next', async () => {
  const { bookingService, waitlistService, repository, tier, clock } = await createFixture({
    offerMs: 60_000,
  });
  const booking = await bookingService.book('booker', { tierId: tier.id, quantity: 1 });
  await bookingService.pay('booker', booking.reference, { paymentToken: 'tok_success' });

  await waitlistService.join('waiter-a', { tierId: tier.id, quantity: 1 });
  await assert.rejects(
    waitlistService.join('waiter-a', { tierId: tier.id, quantity: 1 }),
    (error) => error.code === 'ALREADY_ON_WAITLIST',
  );
  await waitlistService.join('waiter-b', { tierId: tier.id, quantity: 1 });
  await waitlistService.join('waiter-c', { tierId: tier.id, quantity: 1 });
  await bookingService.cancel('booker', booking.reference);

  let offers = await waitlistService.listOffers('waiter-a');
  assert.equal(offers.length, 1);
  assert.equal(offers[0].userId, undefined);
  assert.equal((await repository.findTier(tier.id)).sold, 1);
  assert.deepEqual(await waitlistService.listOffers('waiter-b'), []);

  clock.advance(60_001);
  await assert.rejects(
    waitlistService.accept('waiter-a', offers[0].id),
    (error) => error.code === 'OFFER_EXPIRED',
  );
  offers = await waitlistService.listOffers('waiter-b');
  assert.equal(offers.length, 1);
  assert.equal((await repository.findTier(tier.id)).sold, 1);

  const accepted = await waitlistService.accept('waiter-b', offers[0].id);
  assert.equal(accepted.booking.userId, undefined);
  assert.equal(accepted.booking.status, 'pending');
  assert.equal((await repository.findTier(tier.id)).sold, 1);
  assert.deepEqual(await waitlistService.listOffers('waiter-c'), []);
});

test('maintenance expires unpaid bookings once, frees seats and offers them; paid bookings stay paid', async () => {
  const { bookingService, waitlistService, repository, tier, clock } = await createFixture({
    capacity: 2,
    holdMs: 60_000,
    offerMs: 120_000,
  });
  const pending = await bookingService.book('booker', { tierId: tier.id, quantity: 1 });
  const paid = await bookingService.book('booker', { tierId: tier.id, quantity: 1 });
  await bookingService.pay('booker', paid.reference, { paymentToken: 'tok_success' });
  await waitlistService.join('waiter-a', { tierId: tier.id, quantity: 1 });

  clock.advance(60_001);
  const maintenance = createMaintenanceJob({
    repository,
    bookingService,
    waitlistService,
    clock,
    holdMs: 60_000,
  });
  const result = await maintenance.run();
  assert.equal(result.expiredBookings, 1);
  assert.equal((await repository.findBookingByReference(pending.reference)).status, 'cancelled');
  assert.ok((await repository.findBookingByReference(pending.reference)).expiredAt);
  assert.equal((await repository.findTier(tier.id)).sold, 2);
  assert.equal((await repository.findBookingByReference(paid.reference)).status, 'paid');
  assert.equal((await waitlistService.listOffers('waiter-a')).length, 1);
  await assert.rejects(
    bookingService.pay('booker', pending.reference, { paymentToken: 'tok_success' }),
    (error) => error.code === 'BOOKING_EXPIRED',
  );
  assert.equal((await maintenance.run()).expiredBookings, 0);
});
