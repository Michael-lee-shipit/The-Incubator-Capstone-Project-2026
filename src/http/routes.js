// API routes. Handlers translate HTTP into service calls; services own rules.

import { openApiDocument } from './openapi.js';
import { getOptionalUser, requireRole, requireUser } from './guards.js';
import { registerAuthRoutes } from '../routes/auth.js';

function toNumber(value) {
  return value === undefined || value === '' ? undefined : Number(value);
}

function searchCriteria(query) {
  return {
    q: query.q,
    city: query.city,
    from: query.from,
    to: query.to,
    maxPriceCents: toNumber(query.maxPriceCents),
    onlyAvailable: query.onlyAvailable === 'true' || query.onlyAvailable === '1',
  };
}

export function registerApiRoutes(router, { eventService, bookingService, authService, waitlistService }) {
  registerAuthRoutes(router, { authService });
  router.get('/openapi.json', () => ({ status: 200, body: openApiDocument }));

  router.post('/api/events', async ({ request, body }) => {
    const user = requireRole(requireUser(request), 'organizer');
    return { status: 201, body: await eventService.createEvent(user.id, body) };
  });

  router.get('/api/events', async ({ query }) => ({
    status: 200,
    body: { events: await eventService.searchPublishedEvents(searchCriteria(query), query.sort || 'date') },
  }));

  router.get('/api/events/mine', async ({ request }) => {
    const user = requireRole(requireUser(request), 'organizer');
    return { status: 200, body: { events: await eventService.listOwnEvents(user.id) } };
  });

  router.get('/api/events/:id', async ({ request, params }) => ({
    status: 200,
    body: await eventService.getEvent(getOptionalUser(request)?.id, params.id),
  }));

  router.post('/api/events/:id/tiers', async ({ request, params, body }) => {
    const user = requireRole(requireUser(request), 'organizer');
    return { status: 201, body: await eventService.addTier(user.id, params.id, body) };
  });

  router.post('/api/events/:id/publish', async ({ request, params }) => {
    const user = requireRole(requireUser(request), 'organizer');
    return { status: 200, body: await eventService.publishEvent(user.id, params.id) };
  });

  router.post('/api/events/:id/unpublish', async ({ request, params }) => {
    const user = requireRole(requireUser(request), 'organizer');
    return { status: 200, body: await eventService.unpublishEvent(user.id, params.id) };
  });

  router.post('/api/bookings', async ({ request, body }) => {
    const user = requireRole(requireUser(request), 'attendee');
    return { status: 201, body: await bookingService.book(user.id, body) };
  });

  router.get('/api/bookings', async ({ request }) => {
    const user = requireRole(requireUser(request), 'attendee');
    return { status: 200, body: { bookings: await bookingService.listBookings(user.id) } };
  });

  router.get('/api/bookings/:reference', async ({ request, params }) => {
    const user = requireRole(requireUser(request), 'attendee');
    return { status: 200, body: await bookingService.getBooking(user.id, params.reference) };
  });

  router.post('/api/bookings/:reference/pay', async ({ request, params, body }) => {
    const user = requireRole(requireUser(request), 'attendee');
    return { status: 200, body: await bookingService.pay(user.id, params.reference, body) };
  });

  router.post('/api/bookings/:reference/cancel', async ({ request, params }) => {
    const user = requireRole(requireUser(request), 'attendee');
    return { status: 200, body: await bookingService.cancel(user.id, params.reference) };
  });

  router.get('/api/bookings/:reference/refund-preview', async ({ request, params }) => {
    const user = requireRole(requireUser(request), 'attendee');
    return { status: 200, body: await bookingService.previewRefund(user.id, params.reference) };
  });

  router.post('/api/waitlist', async ({ request, body }) => {
    const user = requireRole(requireUser(request), 'attendee');
    return { status: 201, body: await waitlistService.join(user.id, body) };
  });

  router.get('/api/waitlist/offers', async ({ request }) => {
    const user = requireRole(requireUser(request), 'attendee');
    return { status: 200, body: { offers: await waitlistService.listOffers(user.id) } };
  });

  router.post('/api/waitlist/offers/:id/accept', async ({ request, params }) => {
    const user = requireRole(requireUser(request), 'attendee');
    return { status: 200, body: await waitlistService.accept(user.id, params.id) };
  });

  return router;
}
