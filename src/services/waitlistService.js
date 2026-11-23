import { DomainError } from '../domain/errors.js';
import { newId } from '../domain/ids.js';
import { requireQuantity } from '../domain/validation.js';
import { systemClock } from '../lib/clock.js';
import { requireActor } from './eventService.js';

export const WAITLIST_OFFER_MS = 15 * 60 * 1000;

function publicOffer(offer) {
  const { userId, ...visible } = offer;
  return visible;
}

function publicEntry(entry) {
  const { userId, ...visible } = entry;
  return visible;
}

export function createWaitlistService({
  repository,
  seatService,
  clock = systemClock,
  offerHoldMs = WAITLIST_OFFER_MS,
  createBooking,
}) {
  async function offerNext(tierId) {
    const active = await repository.findActiveOfferForTier(tierId);
    if (active) return null;

    const tier = await repository.findTier(tierId);
    if (!tier) return null;
    const next = (await repository.listWaitingEntriesForTier(tierId))[0];
    if (!next || next.quantity > tier.capacity - tier.sold) return null;

    if (!(await repository.compareAndSetWaitlistStatus(next.id, 'waiting', 'offered'))) return null;
    let seatsHeld = false;
    try {
      await seatService.hold(tierId, next.quantity);
      seatsHeld = true;
      const createdAt = clock.now();
      const offer = await repository.createWaitlistOffer({
        id: newId(),
        waitlistEntryId: next.id,
        userId: next.userId,
        tierId,
        quantity: next.quantity,
        status: 'active',
        createdAt: createdAt.toISOString(),
        expiresAt: new Date(createdAt.getTime() + offerHoldMs).toISOString(),
      });
      return publicOffer(offer);
    } catch (error) {
      if (seatsHeld) await seatService.release(tierId, next.quantity);
      await repository.compareAndSetWaitlistStatus(next.id, 'offered', 'waiting');
      throw error;
    }
  }

  async function expireOffer(offer) {
    const expired = await repository.compareAndSetOfferStatus(offer.id, 'active', 'expired', {
      expiredAt: clock.now().toISOString(),
    });
    if (!expired) return false;
    await repository.compareAndSetWaitlistStatus(offer.waitlistEntryId, 'offered', 'expired');
    await seatService.release(offer.tierId, offer.quantity);
    await offerNext(offer.tierId);
    return true;
  }

  return {
    async join(actorId, input) {
      const userId = requireActor(actorId);
      if (input === null || typeof input !== 'object' || Array.isArray(input)) {
        throw new DomainError('VALIDATION', 'Request body must be a JSON object');
      }
      const { tierId, quantity } = input;
      if (typeof tierId !== 'string' || tierId.trim() === '') {
        throw new DomainError('VALIDATION', 'tierId is required');
      }
      requireQuantity(quantity);

      const existing = await repository.findCurrentWaitlistEntry(tierId, userId);
      if (existing) throw new DomainError('ALREADY_ON_WAITLIST', 'You are already on this tier waitlist');
      const tier = await repository.findTier(tierId);
      if (!tier) throw new DomainError('NOT_FOUND', 'Ticket tier not found');
      if (quantity > tier.capacity) {
        throw new DomainError('VALIDATION', 'quantity cannot exceed the ticket tier capacity');
      }
      const event = await repository.findEvent(tier.eventId);
      if (!event || event.status !== 'published') {
        throw new DomainError('NOT_FOUND', 'Published event not found');
      }
      if (tier.capacity > tier.sold) {
        throw new DomainError('NOT_SOLD_OUT', 'This ticket tier still has seats available');
      }
      return publicEntry(await repository.createWaitlistEntry({
        id: newId(),
        tierId,
        userId,
        quantity,
        status: 'waiting',
        createdAt: clock.now().toISOString(),
      }));
    },

    async offerAvailable(tierId) {
      return offerNext(tierId);
    },

    async listOffers(actorId) {
      const userId = requireActor(actorId);
      await this.expireOffers();
      return (await repository.listActiveOffersForUser(userId)).map(publicOffer);
    },

    async accept(actorId, offerId) {
      const userId = requireActor(actorId);
      const offer = await repository.findWaitlistOffer(offerId);
      if (!offer || offer.userId !== userId) throw new DomainError('NOT_FOUND', 'Waitlist offer not found');
      if (offer.status !== 'active') throw new DomainError('OFFER_EXPIRED', 'This waitlist offer has expired');
      if (new Date(offer.expiresAt).getTime() <= clock.now().getTime()) {
        await expireOffer(offer);
        throw new DomainError('OFFER_EXPIRED', 'This waitlist offer has expired');
      }
      if (!createBooking) throw new DomainError('INVALID_STATE', 'Waitlist booking is not configured');

      if (!(await repository.compareAndSetOfferStatus(offer.id, 'active', 'accepted', {
        acceptedAt: clock.now().toISOString(),
      }))) {
        throw new DomainError('OFFER_EXPIRED', 'This waitlist offer is no longer available');
      }
      if (!(await repository.compareAndSetWaitlistStatus(offer.waitlistEntryId, 'offered', 'fulfilled'))) {
        await repository.compareAndSetOfferStatus(offer.id, 'accepted', 'active');
        throw new DomainError('INVALID_STATE', 'Waitlist entry is no longer available');
      }
      try {
        const booking = await createBooking(userId, offer);
        return { offer: publicOffer({ ...offer, status: 'accepted' }), booking };
      } catch (error) {
        await seatService.release(offer.tierId, offer.quantity);
        await repository.compareAndSetWaitlistStatus(offer.waitlistEntryId, 'fulfilled', 'offered');
        await repository.compareAndSetOfferStatus(offer.id, 'accepted', 'active');
        await offerNext(offer.tierId);
        throw error;
      }
    },

    async expireOffers() {
      const now = clock.now();
      const expiredOffers = await repository.listExpiredActiveOffers(now.toISOString());
      let expiredCount = 0;
      for (const offer of expiredOffers) {
        if (await expireOffer(offer)) expiredCount += 1;
      }
      return expiredCount;
    },
  };
}
