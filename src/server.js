import { pathToFileURL } from 'node:url';
import { createAppServer } from './http/app.js';
import { Router } from './http/router.js';
import { registerApiRoutes } from './http/routes.js';
import { createMockPaymentGateway } from './lib/mockPaymentGateway.js';
import { createSqliteRepository } from './repositories/sqlite.js';
import { createBookingService } from './services/bookingService.js';
import { createEventService } from './services/eventService.js';
import { createAuthService } from './services/authService.js';
import { validateTokenSecret } from './lib/token.js';
import { systemClock } from './lib/clock.js';
import { createSeatService } from './services/seatService.js';
import { createWaitlistService, WAITLIST_OFFER_MS } from './services/waitlistService.js';
import { BOOKING_HOLD_MS, createMaintenanceJob, MAINTENANCE_INTERVAL_MS } from './jobs/maintenance.js';
import { DATABASE_PATH, PORT } from './config.js';

// The one place where the layers are wired together. Tests call this too, and
// can pass in their own repository or payment gateway. With no repository, it
// uses an empty SQLite database in memory.
function createTicketingSystem({
  repository = createSqliteRepository(),
  paymentGateway = createMockPaymentGateway(),
  clock = systemClock,
  holdMs = BOOKING_HOLD_MS,
  offerHoldMs = WAITLIST_OFFER_MS,
} = {}) {
  const eventService = createEventService({ repository });
  const seatService = createSeatService({ repository });
  let bookingService;
  const waitlistService = createWaitlistService({
    repository,
    seatService,
    clock,
    offerHoldMs,
    createBooking: (userId, offer) => bookingService.bookFromHeldSeats(userId, offer),
  });
  bookingService = createBookingService({
    repository,
    paymentGateway,
    clock,
    holdMs,
    seatService,
    waitlistService,
  });
  const authService = createAuthService({ repository });
  const router = registerApiRoutes(new Router(), { eventService, bookingService, authService, waitlistService });
  return {
    server: createAppServer({ router }),
    maintenance: createMaintenanceJob({ repository, bookingService, waitlistService }),
  };
}

export function createTicketingServer(options) {
  return createTicketingSystem(options).server;
}

// The real server keeps its data in a SQLite file, so it survives a restart.
export function startServer(port = PORT, databasePath = DATABASE_PATH) {
  validateTokenSecret();
  const repository = createSqliteRepository({ path: databasePath });
  const { server, maintenance } = createTicketingSystem({ repository });
  let maintenanceRunning = false;
  const maintenanceTimer = setInterval(async () => {
    if (maintenanceRunning) return;
    maintenanceRunning = true;
    try {
      await maintenance.run();
    } catch (error) {
      console.error('Ticketing maintenance failed', error);
    } finally {
      maintenanceRunning = false;
    }
  }, MAINTENANCE_INTERVAL_MS);
  maintenanceTimer.unref();
  server.on('close', () => clearInterval(maintenanceTimer));
  server.on('close', () => repository.close());
  server.listen(port, () => {
    console.log(`Event ticketing server listening on port ${port}`);
    console.log(`Data is stored in ${databasePath}`);
  });

  const shutDown = () => server.close(() => process.exit(0));
  process.once('SIGINT', shutDown);
  process.once('SIGTERM', shutDown);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}
