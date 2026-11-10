import { getAuthToken, clearSession } from './session.js';

const API_BASE = '/api';

async function request(endpoint, options = {}) {
    const token = getAuthToken();
    
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const config = {
        ...options,
        headers
    };

    const response = await fetch(`${API_BASE}${endpoint}`, config);
    
    if (response.status === 401) {
        // Token expired or invalid
        clearSession();
        window.location.href = '/login.html';
        return;
    }

    const data = await response.json();

    if (!response.ok) {
        const error = new Error(data.error?.message || 'An error occurred');
        error.code = data.error?.code || 'UNKNOWN_ERROR';
        error.status = response.status;
        throw error;
    }

    return data;
}

export const api = {
    // Auth
    signup: (credentials) => request('/auth/signup', { method: 'POST', body: JSON.stringify(credentials) }),
    login: (credentials) => request('/auth/login', { method: 'POST', body: JSON.stringify(credentials) }),
    getMe: () => request('/auth/me'),

    // Events
    getEvents: () => request('/events'),
    getEvent: (id) => request(`/events/${id}`),
    createEvent: (eventData) => request('/events', { method: 'POST', body: JSON.stringify(eventData) }),
    updateEvent: (id, eventData) => request(`/events/${id}`, { method: 'PUT', body: JSON.stringify(eventData) }),
    publishEvent: (id) => request(`/events/${id}/publish`, { method: 'POST' }),
    unpublishEvent: (id) => request(`/events/${id}/unpublish`, { method: 'POST' }),

    // Tiers
    addTier: (eventId, tierData) => request(`/events/${eventId}/tiers`, { method: 'POST', body: JSON.stringify(tierData) }),

    // Bookings & Payments
    getBookings: () => request('/bookings'),
    createBooking: (bookingData) => request('/bookings', { method: 'POST', body: JSON.stringify(bookingData) }),
    cancelBooking: (id) => request(`/bookings/${id}/cancel`, { method: 'POST' })
};