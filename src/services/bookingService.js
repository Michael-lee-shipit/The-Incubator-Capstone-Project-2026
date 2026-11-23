// Booking rules for the API: book, pay (mock), cancel and expire.

import { assertTransition } from '../domain/bookingStateMachine.js';
import { DomainError } from '../domain/errors.js';
import { newId, referenceCode } from '../domain/ids.js';
import { calculateRefund } from '../domain/refundPolicy.js';
import { systemClock } from '../lib/clock.js';
import { requireQuantity, requireText, soldOutError } from '../domain/validation.js';
import { requireActor } from './eventService.js';
import { BOOKING_HOLD_MS } from '../jobs/maintenance.js';

function toPublicBooking(booking) {
  const { id, userId, chargeId, ...visible } = booking;
  return visible;
}

export function createBookingService({
  repository,
  paymentGateway,
  clock = systemClock,
  now,
  holdMs = BOOKING_HOLD_MS,
  seatService,
  waitlistService,
}) {
  const currentTime = () => (now ? now() : clock.now());

  async function getOwnBooking(actorId, reference) {
    const booking = await repository.findBookingByReference(String(reference).toUpperCase());
    if (!booking) throw new DomainError('NOT_FOUND', 'Booking not found');
    if (booking.userId !== actorId) {
      throw new DomainError('NOT_FOUND', 'Booking not found');
    }
    return booking;
  }

  async function uniqueReference() {
    let reference;
    do {
      reference = referenceCode();
    } while (await repository.findBookingByReference(reference));
    return reference;
  }

  async function insertBooking(userId, tier, event, quantity) {
    const createdAt = currentTime();
    const booking = {
      id: newId(),
      reference: await uniqueReference(),
      userId,
      eventId: event.id,
      tierId: tier.id,
      quantity,
      amountCents: tier.priceCents * quantity,
      status: 'pending',
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + holdMs).toISOString(),
    };
    return toPublicBooking(await repository.insertBooking(booking));
  }

  async function releaseSeats(booking) {
    if (seatService) await seatService.release(booking.tierId, booking.quantity);
    else if (!(await repository.releaseSeats(booking.tierId, booking.quantity))) {
      throw new DomainError('INVALID_STATE', 'Seats could not be released');
    }
    if (waitlistService) await waitlistService.offerAvailable(booking.tierId);
  }

  return {
    async book(actorId, input) {
      const userId = requireActor(actorId);
      if (input === null || typeof input !== 'object' || Array.isArray(input)) {
        throw new DomainError('VALIDATION', 'Request body must be a JSON object');
      }
      const { tierId, quantity } = input;
      requireText(tierId, 'tierId');
      requireQuantity(quantity);

      const tier = await repository.findTier(tierId);
      if (!tier) throw new DomainError('NOT_FOUND', 'Ticket tier not found');
      const event = await repository.findEvent(tier.eventId);
      if (!event || event.status !== 'published') {
        throw new DomainError('INVALID_STATE', 'This event is not open for booking');
      }

      if (!(await repository.reserveSeats(tierId, quantity))) {
        throw soldOutError((await repository.findTier(tierId)) ?? tier);
      }

      try {
        return await insertBooking(userId, tier, event, quantity);
      } catch (error) {
        await repository.releaseSeats(tierId, quantity);
        throw error;
      }
    },

    async bookFromHeldSeats(actorId, offer) {
      const userId = requireActor(actorId);
      const tier = await repository.findTier(offer.tierId);
      if (!tier) throw new DomainError('NOT_FOUND', 'Ticket tier not found');
      const event = await repository.findEvent(tier.eventId);
      if (!event || event.status !== 'published') {
        throw new DomainError('INVALID_STATE', 'This event is not open for booking');
      }
      return insertBooking(userId, tier, event, offer.quantity);
    },

    async getBooking(actorId, reference) {
      return toPublicBooking(await getOwnBooking(requireActor(actorId), reference));
    },

    async listBookings(actorId) {
      const userId = requireActor(actorId);
      return (await repository.listBookingsByUser(userId)).map(toPublicBooking);
    },

    async pay(actorId, reference, input) {
      const booking = await getOwnBooking(requireActor(actorId), reference);
      if (booking.expiredAt) {
        throw new DomainError('BOOKING_EXPIRED', 'This booking has expired');
      }
      assertTransition(booking.status, 'paid');
      const paymentToken = requireText(input?.paymentToken, 'paymentToken');
      const charge = await paymentGateway.charge({
        amountCents: booking.amountCents,
        paymentToken,
        idempotencyKey: booking.reference,
      });
      if (charge.status !== 'succeeded') {
        throw new DomainError('PAYMENT_DECLINED', 'The card was declined. Try another card.');
      }

      const paid = {
        ...booking,
        status: 'paid',
        chargeId: charge.chargeId,
        paidAt: currentTime().toISOString(),
      };
      const saved = await repository.compareAndSetBookingStatus(booking.reference, 'pending', paid);
      if (!saved) {
        await paymentGateway.refund({
          amountCents: booking.amountCents,
          idempotencyKey: `${booking.reference}:late-charge`,
        });
        const latest = await repository.findBookingByReference(booking.reference);
        if (latest?.expiredAt) throw new DomainError('BOOKING_EXPIRED', 'This booking has expired');
        throw new DomainError('INVALID_TRANSITION', `Cannot transition booking from ${latest?.status} to paid`);
      }
      return toPublicBooking(saved);
    },

    async previewRefund(actorId, reference) {
      const booking = await getOwnBooking(requireActor(actorId), reference);
      if (booking.status !== 'paid') {
        throw new DomainError('INVALID_STATE', 'Only paid bookings can be refunded');
      }
      const event = await repository.findEvent(booking.eventId);
      if (!event) throw new DomainError('NOT_FOUND', 'Event not found');
      const refund = calculateRefund({
        amountCents: booking.amountCents,
        startsAt: event.startsAt,
        now: currentTime(),
      });
      return {
        reference: booking.reference,
        amountCents: refund.amountCents,
        percentage: refund.percentage,
      };
    },

    async cancel(actorId, reference) {
      const booking = await getOwnBooking(requireActor(actorId), reference);
      assertTransition(booking.status, 'cancelled');

      let refundAmountCents = 0;
      let nextStatus = 'cancelled';
      if (booking.status === 'paid') {
        const event = await repository.findEvent(booking.eventId);
        if (!event) throw new DomainError('NOT_FOUND', 'Event not found');
        const refund = calculateRefund({
          amountCents: booking.amountCents,
          startsAt: event.startsAt,
          now: currentTime(),
        });
        refundAmountCents = refund.amountCents;
        if (refundAmountCents > 0) nextStatus = 'refunded';
      }

      const cancelledAt = currentTime().toISOString();
      const updated = {
        ...booking,
        status: nextStatus,
        cancelledAt,
        refundAmountCents,
        ...(refundAmountCents > 0 ? { refundedAt: cancelledAt } : {}),
      };
      const saved = await repository.compareAndSetBookingStatus(booking.reference, booking.status, updated);
      if (!saved) {
        const latest = await repository.findBookingByReference(booking.reference);
        throw new DomainError('INVALID_TRANSITION', `Cannot cancel a ${latest?.status ?? booking.status} booking`);
      }

      try {
        if (refundAmountCents > 0) {
          await paymentGateway.refund({
            amountCents: refundAmountCents,
            idempotencyKey: booking.reference,
          });
        }
      } catch (error) {
        await repository.compareAndSetBookingStatus(booking.reference, nextStatus, booking);
        throw error;
      }

      await releaseSeats(booking);
      return toPublicBooking(saved);
    },

    async expirePendingBookings() {
      const nowValue = currentTime();
      const expired = await repository.listPendingBookingsToExpire(
        nowValue.toISOString(),
        new Date(nowValue.getTime() - holdMs).toISOString(),
      );
      let expiredCount = 0;
      for (const booking of expired) {
        const expiredAt = nowValue.toISOString();
        const saved = await repository.compareAndSetBookingStatus(booking.reference, 'pending', {
          ...booking,
          status: 'cancelled',
          cancelledAt: expiredAt,
          expiredAt,
        });
        if (!saved) continue;
        await releaseSeats(booking);
        expiredCount += 1;
      }
      return expiredCount;
    },
  };
}
