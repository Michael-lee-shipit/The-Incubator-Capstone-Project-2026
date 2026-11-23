export const BOOKING_HOLD_MS = 15 * 60 * 1000;
export const MAINTENANCE_INTERVAL_MS = 30 * 1000;

export function createMaintenanceJob({ bookingService, waitlistService }) {
  return {
    async run() {
      const expiredBookings = await bookingService.expirePendingBookings();
      const expiredOffers = await waitlistService.expireOffers();
      return { expiredBookings, expiredOffers };
    },
  };
}
