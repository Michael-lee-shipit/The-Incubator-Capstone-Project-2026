import { verifyToken } from '../lib/token.js';

/**
 * Middleware to require a valid Bearer token.
 * Attaches decoded token payload to req.user if valid.
 * Rejects missing, edited, or expired tokens with UNAUTHENTICATED.
 */
export function requireUser() {
    return (req, res, next) => {
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: { code: 'UNAUTHENTICATED', message: 'Missing or malformed authorization header' }
            });
        }

        const token = authHeader.split(' ')[1];
        const payload = verifyToken(token);

        if (!payload) {
            return res.status(401).json({
                error: { code: 'UNAUTHENTICATED', message: 'Invalid or expired token' }
            });
        }

        req.user = payload; // Contains sub (userId), role, email, exp
        next();
    };
}

/**
 * Middleware to enforce role-based access control.
 * Rejects users without the required role with FORBIDDEN.
 */
export function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                error: { code: 'FORBIDDEN', message: 'Access denied for your role' }
            });
        }
        next();
    };
}

/**
 * Ownership guard for attendee bookings.
 * An attendee can only access/cancel their own booking. Other person's booking -> NOT_FOUND or FORBIDDEN per spec.
 */
export function requireBookingOwner(bookingRepository) {
    return async (req, res, next) => {
        try {
            const bookingId = req.params.id || req.params.bookingId;
            const booking = await bookingRepository.findById(bookingId);

            if (!booking) {
                return res.status(404).json({
                    error: { code: 'NOT_FOUND', message: 'Booking not found' }
                });
            }

            // Staff can view all, but regular attendees only view their own
            if (req.user.role === 'attendee' && booking.userId !== req.user.sub) {
                return res.status(404).json({
                    error: { code: 'NOT_FOUND', message: 'Booking not found' }
                });
            }

            req.booking = booking;
            next();
        } catch (err) {
            next(err);
        }
    };
}

/**
 * Ownership guard for organizer events.
 * An organizer can only modify/publish their own events. Otherwise FORBIDDEN.
 */
export function requireEventOwner(eventRepository) {
    return async (req, res, next) => {
        try {
            const eventId = req.params.id || req.params.eventId;
            const event = await eventRepository.findById(eventId);

            if (!event) {
                return res.status(404).json({
                    error: { code: 'NOT_FOUND', message: 'Event not found' }
                });
            }

            if (req.user.role === 'organizer' && event.organizerId !== req.user.sub) {
                return res.status(403).json({
                    error: { code: 'FORBIDDEN', message: 'You do not own this event' }
                });
            }

            req.event = event;
            next();
        } catch (err) {
            next(err);
        }
    };
}