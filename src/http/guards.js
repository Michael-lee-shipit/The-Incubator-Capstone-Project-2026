import { DomainError } from '../domain/errors.js';
import { verifyToken } from '../lib/token.js';

const ROLES = new Set(['attendee', 'organizer', 'staff']);

export function getOptionalUser(request) {
  const authorization = request.headers.authorization;
  if (authorization === undefined) return null;

  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  const payload = match && verifyToken(match[1]);
  if (
    !payload ||
    typeof payload.sub !== 'string' ||
    !ROLES.has(payload.role) ||
    typeof payload.email !== 'string'
  ) {
    throw new DomainError('UNAUTHENTICATED', 'A valid bearer token is required');
  }
  return { id: payload.sub, email: payload.email, role: payload.role };
}

export function requireUser(request) {
  const user = getOptionalUser(request);
  if (!user) throw new DomainError('UNAUTHENTICATED', 'A valid bearer token is required');
  return user;
}

export function requireRole(user, ...allowedRoles) {
  if (!allowedRoles.includes(user.role)) {
    throw new DomainError('FORBIDDEN', 'Access denied for your role');
  }
  return user;
}
