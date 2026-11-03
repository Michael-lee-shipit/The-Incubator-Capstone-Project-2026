// public/js/api.js
import { mockDatabase } from './mockData.js';

export async function listEvents(filters = {}) {
  await new Promise(r => setTimeout(r, 150)); // simulate network latency
  let result = mockDatabase.events.filter(e => e.published);

  if (filters.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(e => e.title.toLowerCase().includes(q) || e.venue.toLowerCase().includes(q));
  }
  if (filters.city) {
    result = result.filter(e => e.city.toLowerCase() === filters.city.toLowerCase());
  }
  if (filters.maxPrice) {
    const max = Number(filters.maxPrice);
    result = result.filter(e => e.tiers.some(t => t.price <= max));
  }
  if (filters.sort === 'date') {
    result.sort((a, b) => new Date(a.date) - new Date(b.date));
  } else if (filters.sort === 'price') {
    result.sort((a, b) => Math.min(...a.tiers.map(t => t.price)) - Math.min(...b.tiers.map(t => t.price)));
  }

  return { events: result };
}

export async function getEvent(id) {
  await new Promise(r => setTimeout(r, 100));
  const event = mockDatabase.events.find(e => e.id === id);
  if (!event) throw new Error("EVENT_NOT_FOUND");
  return { event };
}

export async function createBooking({ eventId, tierId, quantity }) {
  await new Promise(r => setTimeout(r, 200));
  const event = mockDatabase.events.find(e => e.id === eventId);
  if (!event) throw new Error("EVENT_NOT_FOUND");
  const tier = event.tiers.find(t => t.id === tierId);
  if (!tier) throw new Error("TIER_NOT_FOUND");

  const available = tier.capacity - tier.sold;
  if (quantity > available) throw new Error("SOLD_OUT");

  const reference = "BK-" + Math.random().toString(36).substring(2, 8).toUpperCase();
  const booking = {
    reference,
    eventId,
    tierId,
    quantity,
    status: "pending",
    createdAt: Date.now(),
    expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes hold
  };

  mockDatabase.bookings.push(booking);
  return { booking };
}

export async function payBooking({ reference, cardNumber }) {
  await new Promise(r => setTimeout(r, 300));
  const booking = mockDatabase.bookings.find(b => b.reference === reference);
  if (!booking) throw new Error("BOOKING_NOT_FOUND");
  if (booking.status !== "pending") throw new Error("INVALID_TRANSITION");

  // Mock card logic: if card ends in '0000', simulate decline
  if (cardNumber && cardNumber.endsWith("0000")) {
    throw new Error("PAYMENT_DECLINED");
  }

  booking.status = "paid";
  
  // Update sold count
  const event = mockDatabase.events.find(e => e.id === booking.eventId);
  if (event) {
    const tier = event.tiers.find(t => t.id === booking.tierId);
    if (tier) {
      tier.sold += booking.quantity;
    }
  }

  return { booking, payment: { status: "success", chargedAt: new Date().toISOString() } };
}