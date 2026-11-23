export const systemClock = Object.freeze({
  now: () => new Date(),
});

export function createClock(initial = new Date()) {
  let timestamp = new Date(initial).getTime();
  if (!Number.isFinite(timestamp)) throw new TypeError('Clock requires a valid date');

  return {
    now: () => new Date(timestamp),
    set(value) {
      const next = new Date(value).getTime();
      if (!Number.isFinite(next)) throw new TypeError('Clock requires a valid date');
      timestamp = next;
    },
    advance(milliseconds) {
      if (!Number.isFinite(milliseconds)) throw new TypeError('Clock advance must be finite');
      timestamp += milliseconds;
    },
  };
}
