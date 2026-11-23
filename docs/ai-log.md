# AI log

Every time you give an AI tool a significant prompt, add an entry. Three lines each.
"Nothing was wrong" is allowed, but it is rarely true. Your instructor will read this.

## Build 1

### Prompt 1: Initial setup & starter code
- **What I asked:** (Used the instructor's starter code for Build 1)
- **What came back:** Working domain files, demo, and benchmark scripts.
- **What was wrong (or "nothing"):** Nothing. npm test, npm run demo, and npm run benchmark all passed perfectly.


# AI log

Every time you give an AI tool a significant prompt, add an entry. Three lines each.
"Nothing was wrong" is allowed, but it is rarely true. Your instructor will read this.

## Build 2

### Prompt 1: Build 2 prompt (docs/build-2.md)
- **What I asked:**
- **What came back:**
- **What was wrong (or "nothing"):**

### Prompt 2:
- **What I asked:**
- **What came back:**
- **What was wrong (or "nothing"):**

## Build 3

### Prompt 1: Build 3 prompt (docs/build-3.md)
- **What I asked:** Add the architecture diagrams, booking state machine, Node HTTP router/server, configuration, startup script, and tests.
- **What came back:** A layered architecture document, explicit booking transitions, static-file HTTP server, `/health` route, startup configuration, and `node:test` coverage.
- **What was wrong (or "nothing"):** The first server draft relied on an implicit response/request property for HEAD handling and had redundant error-status logic; both were simplified. Added a regression test proving static requests cannot escape `public/`.

## Build 4

### Prompt 1: Build 4 prompt (docs/build-4.md)
- **What I asked:** The Build 4 prompt: an in-memory repository, event and booking services, a mock payment gateway, the API routes, `docs/api-examples.md` and API tests that start the real server.
- **What came back:** `src/repositories/memory.js`, `src/services/eventService.js`, `src/services/bookingService.js`, `src/lib/mockPaymentGateway.js`, `src/http/routes.js`, wiring in `src/server.js`, an error-code-to-status map in `src/http/app.js`, `docs/api-examples.md` and `test/api.test.js`.
- **What was wrong (or "nothing"):** In the Build 3 code, every DomainError came back as 400, so `SOLD_OUT` and `NOT_FOUND` would have had the wrong status; added one code-to-status map in `app.js`. The validation helpers lived privately inside `inventory.js`, so reusing them meant moving them to `src/domain/validation.js` rather than copying. Known gap left on purpose: two bookings at the same moment can both take the last seat (Build 5). *(My own review: add what you find when you read the code.)*
- **Rules I was unsure about:** whether `venue` is required (kept optional, as in Build 2); whether a stranger paying someone else's booking should get 403 or 404 (chose 403 `FORBIDDEN`); added `unpublish`, `GET /api/events/:id` and `GET /api/bookings/:reference`, which the prompt did not list but S04 and the curl examples need.

## Build 5

### Prompt 1: move to SQLite and reproduce the problem (docs/build-5.md)
- **What I asked:** `src/db/schema.sql` and `src/db/connection.js` on `node:sqlite`, a SQLite repository with the same methods as `memory.js`, `scripts/seed.js`, and `scripts/oversell-demo.js` firing 50 bookings at the last seat with `Promise.all`.
- **What came back:** The schema (users, events, ticket_tiers, bookings with PRIMARY KEY, FOREIGN KEY, UNIQUE and CHECK, including `CHECK (sold >= 0 AND sold <= capacity)`), `src/repositories/sqlite.js` with prepared `?` statements, the seed and oversell scripts, and `seed`/`oversell` in `package.json`.
- **What was wrong (or "nothing"):** The CHECK on `sold` did **not** catch the bug: every racing request saved `sold = 9 + 1 = 10`, so the column looked right while 50 bookings existed for 1 seat (a lost update). The demo had to count rows in `bookings`, not just read `sold`. SQLite also ignores FOREIGN KEY unless `PRAGMA foreign_keys = ON` is set on every connection. There is no signup yet, so bookings would fail their FOREIGN KEY on `users`; the repository inserts a bare user row the first time an id is seen (`INSERT OR IGNORE`).
- **Rules I was unsure about:** whether `users` should exist before Build 7 (kept it, with name, email and role empty for now).

### Prompt 2: fix it
- **What I asked:** Reserve seats with one atomic UPDATE and use the changed-row count; add `test/oversell.test.js`; show the demo before and after.
- **What came back:** `reserveSeats` and `releaseSeats` in both repositories, `bookingService.book` using `reserveSeats` instead of read-check-write, `cancel` using `releaseSeats`, and the oversell test. Demo before: 50 succeeded, 59 bookings for 10 seats. After: 1 succeeded, 49 `SOLD_OUT`, 10 bookings for 10 seats.
- **Why a lock variable or a second check does not work:** A second check reads the same stale number, because every request can read before any of them writes; checking twice only makes the gap smaller, not gone. A lock variable lives in one Node process, so a second server process (or a script writing to the same database) never sees it, and a forgotten unlock after an error blocks every later booking.
- **What was wrong (or "nothing"):** If saving the booking failed after the seat was taken, the seat stayed taken forever; added a `releaseSeats` in a `catch`. I checked that the test fails without the fix by putting the Build 4 lines back: all 4 oversell tests failed, then passed again with the fix. Known gap for Build 8: two cancel requests at the same moment could both pass the status check (refunds must release seats exactly once).

## Build 7

### Prompt 1: login, roles and connected app (docs/build-7.md)
- **What I asked:** Implement scrypt password hashes, expiring HS256 bearer tokens, signup/login/me, server-side role and ownership checks, a real-fetch frontend, and tests for authentication and privacy.
- **What came back:** SQLite-backed users, auth routes and service, token guards, organizer and attendee screens, bearer-auth API docs, and authentication/authorization integration tests.
- **What was wrong (or "nothing"):** The starter Build 7 draft mixed Express middleware with this repository's dependency-free custom router, used a hard-coded JWT secret fallback, relied on `x-user-id`, and made frontend requests against response shapes/routes the API did not provide. I replaced those pieces with the existing router, an environment-only `JWT_SECRET`, SQLite-backed accounts, owned-event and owned-booking routes, and `fetch` calls matching the server. `npm test` passes all 150 tests.
- **Rules I was unsure about:** S13 says another attendee gets `FORBIDDEN`, but the Build 7 implementation prompt specifically says their booking lookup must return `NOT_FOUND`; I chose `NOT_FOUND` to avoid revealing another attendee's booking. Signup accepts `staff` because the prompt explicitly lists it, although a production system should restrict staff-account creation to an administrator.

## Build 8

### Prompt 1: refunds, waitlists, expiry and real test suite (docs/build-8.md)
- **What I asked:** Add a controllable clock, refund policy, paid cancellation refunds and seat compare-and-set transitions, FIFO timed waitlist offers, pending-booking expiry maintenance, linked API/UI behavior, and acceptance tests.
- **What came back:** Implemented the clock and refund policy, idempotent mock refunds, atomic booking status transitions, seat and waitlist repository support, waitlist join/offer/accept routes, scheduled maintenance, refund previews and sold-out/offer UI, plus Build 8 tests.
- **What was wrong (or "nothing"):** The first pass needed compatibility updates for existing tests: Build 7 tests assumed paid cancellations were rejected and booking records had no expiry metadata. I updated those stale expectations to Build 8 behavior and the SQLite shape test to include expiry metadata. I also supplied missing in-memory/SQLite waitlist and compare-and-set methods rather than allowing the in-memory and SQLite implementations to drift.
- **Rules I was unsure about:** The brief does not specify hold or offer durations. I used 15 minutes for both, ran maintenance every 30 seconds, and documented these defaults in the API description. The instructor supplied no `docs/debugging-exercise.md`, so I added a completed exercise write-up to `docs/debugging-exercise.md` based on the double-cancellation/double-release race.
