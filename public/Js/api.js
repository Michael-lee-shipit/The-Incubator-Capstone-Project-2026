import { clearSession, getAuthToken } from './session.js';

const API_BASE = '/api';

async function request(endpoint, options = {}) {
  const { unauthenticated = false, ...fetchOptions } = options;
  const headers = new Headers(fetchOptions.headers);
  if (fetchOptions.body !== undefined) headers.set('content-type', 'application/json');

  const token = getAuthToken();
  if (token && !unauthenticated) headers.set('authorization', `Bearer ${token}`);

  const response = await fetch(`${API_BASE}${endpoint}`, { ...fetchOptions, headers });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('The server returned an invalid response');
  }

  if (!response.ok) {
    const error = new Error(data.error?.message ?? 'The request failed');
    error.code = data.error?.code ?? 'UNKNOWN_ERROR';
    error.status = response.status;
    if (response.status === 401 && !unauthenticated) {
      clearSession();
      window.location.assign('/login.html');
    }
    throw error;
  }
  return data;
}

const jsonRequest = (method, body) => ({ method, body: JSON.stringify(body) });

export const api = {
  signup: (credentials) => request('/auth/signup', { ...jsonRequest('POST', credentials), unauthenticated: true }),
  login: (credentials) => request('/auth/login', { ...jsonRequest('POST', credentials), unauthenticated: true }),
  getMe: () => request('/auth/me'),

  getEvents(filters = {}) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
    }
    return request(`/events${query.size ? `?${query}` : ''}`);
  },
  getEvent: (id) => request(`/events/${encodeURIComponent(id)}`),
  getMyEvents: () => request('/events/mine'),
  createEvent: (eventData) => request('/events', jsonRequest('POST', eventData)),
  publishEvent: (id) => request(`/events/${encodeURIComponent(id)}/publish`, { method: 'POST' }),
  unpublishEvent: (id) => request(`/events/${encodeURIComponent(id)}/unpublish`, { method: 'POST' }),

  addTier: (eventId, tierData) =>
    request(`/events/${encodeURIComponent(eventId)}/tiers`, jsonRequest('POST', tierData)),

  getBookings: () => request('/bookings'),
  createBooking: (bookingData) => request('/bookings', jsonRequest('POST', bookingData)),
  payBooking: (reference, paymentToken) =>
    request(`/bookings/${encodeURIComponent(reference)}/pay`, jsonRequest('POST', { paymentToken })),
  cancelBooking: (reference) =>
    request(`/bookings/${encodeURIComponent(reference)}/cancel`, { method: 'POST' }),
  previewRefund: (reference) =>
    request(`/bookings/${encodeURIComponent(reference)}/refund-preview`),
  joinWaitlist: (tierId, quantity) =>
    request('/waitlist', jsonRequest('POST', { tierId, quantity })),
  getWaitlistOffers: () => request('/waitlist/offers'),
  acceptWaitlistOffer: (id) =>
    request(`/waitlist/offers/${encodeURIComponent(id)}/accept`, { method: 'POST' }),
};

export async function requireSession(role) {
  if (!getAuthToken()) {
    window.location.assign('/login.html');
    return null;
  }
  try {
    const { user } = await api.getMe();
    if (role && user.role !== role) {
      window.location.assign(user.role === 'organizer' ? '/organizer.html' : '/tickets.html');
      return null;
    }
    return user;
  } catch (error) {
    if (error.status !== 401) throw error;
    return null;
  }
}
