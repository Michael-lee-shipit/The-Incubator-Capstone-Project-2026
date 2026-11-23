# Build 8 debugging exercise

## Symptom

A paid booking could be cancelled twice in concurrent requests. Both requests could read `paid`, pass the status check, refund money, and release the same seats twice.

## Reproduction

1. Create a paid booking for one seat.
2. Send two `POST /api/bookings/{reference}/cancel` requests at the same time.
3. Observe that both requests can return success in a plain read-check-write implementation.

## Debugging method

I inspected `bookingService.cancel` and the repository update methods. The failure came from a time-of-check/time-of-use gap: the service read and tested the booking status before an independent write. JavaScript could interleave the two cancellation requests between those operations.

I added a repository compare-and-set operation that updates `status` only when the stored status still equals the expected status. I used the booking reference as the gateway refund idempotency key and released seats only after the winning status transition. The losing request immediately fails and cannot call the refund or seat-release step.

## Verification

A concurrent cancellation test now allows exactly one success and one rejected request. The tier's `sold` value returns to 0 once, and the mock gateway records one refund. The test passes against both the memory and SQLite repositories.

## Prevention

- Make state transitions atomic at the data layer.
- Use stable idempotency keys for external money operations.
- Make refund and release operations conditional on a successful state transition.
- Add race tests that issue cancellation requests concurrently rather than only testing sequential cancellation.
