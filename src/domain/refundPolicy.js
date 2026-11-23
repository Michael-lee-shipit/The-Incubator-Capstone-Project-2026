import { DomainError } from './errors.js';

export const DAY_MS = 24 * 60 * 60 * 1000;

export function calculateRefund({ amountCents, startsAt, now }) {
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) {
    throw new DomainError('VALIDATION', 'amountCents must be a non-negative whole number');
  }
  const startTime = new Date(startsAt).getTime();
  const currentTime = new Date(now).getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(currentTime)) {
    throw new DomainError('VALIDATION', 'startsAt and now must be valid dates');
  }
  if (currentTime >= startTime) {
    throw new DomainError('EVENT_STARTED', 'This event has already started');
  }

  const remaining = startTime - currentTime;
  const percentage = remaining >= 7 * DAY_MS ? 100 : remaining >= 2 * DAY_MS ? 50 : 0;
  return { amountCents: Math.floor((amountCents * percentage) / 100), percentage };
}
