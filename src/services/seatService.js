import { DomainError } from '../domain/errors.js';

export function createSeatService({ repository }) {
  return {
    async hold(tierId, quantity) {
      if (!(await repository.reserveSeats(tierId, quantity))) {
        throw new DomainError('SOLD_OUT', 'There are not enough seats available');
      }
    },

    async release(tierId, quantity) {
      if (!(await repository.releaseSeats(tierId, quantity))) {
        throw new DomainError('INVALID_STATE', 'Seats could not be released');
      }
    },
  };
}
