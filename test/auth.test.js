import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createTicketingServer } from '../src/server.js';
import { createMemoryRepository } from '../src/repositories/memory.js';
import { hashPassword, verifyPassword } from '../src/lib/password.js';
import { signToken, verifyToken } from '../src/lib/token.js';

process.env.JWT_SECRET = 'test-only-secret-for-event-ticketing';

const repository = createMemoryRepository();
const server = createTicketingServer({ repository });
let baseUrl;

before(async () => {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function call(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function signup(email, role = 'attendee') {
  const response = await call('POST', '/api/auth/signup', {
    body: { email, password: 'correct horse battery', role },
  });
  assert.equal(response.status, 201);
  return response.body;
}

test('passwords are stored as salted scrypt hashes and only verify the right password', async () => {
  const firstHash = await hashPassword('correct horse battery');
  const secondHash = await hashPassword('correct horse battery');
  assert.notEqual(firstHash, 'correct horse battery');
  assert.notEqual(firstHash, secondHash);
  assert.equal(await verifyPassword('correct horse battery', firstHash), true);
  assert.equal(await verifyPassword('wrong password', firstHash), false);
  assert.equal(await verifyPassword('wrong password', 'not-a-hash'), false);
});

test('signup returns a session, stores only a hash and rejects duplicate email', async () => {
  const result = await signup('attendee@example.test');
  assert.equal(result.user.role, 'attendee');
  assert.equal(typeof result.token, 'string');
  assert.equal('password' in result.user, false);
  assert.equal('passwordHash' in result.user, false);
  assert.notEqual((await repository.findUserByEmail('attendee@example.test')).passwordHash, 'correct horse battery');

  const duplicate = await call('POST', '/api/auth/signup', {
    body: { email: 'ATTENDEE@example.test', password: 'correct horse battery' },
  });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error.code, 'EMAIL_TAKEN');
});

test('signup validates password length and roles', async () => {
  for (const body of [
    { email: 'short@example.test', password: 'short' },
    { email: 'role@example.test', password: 'long enough', role: 'admin' },
  ]) {
    const response = await call('POST', '/api/auth/signup', { body });
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'VALIDATION');
  }
});

test('login succeeds and wrong-password and unknown-email errors are identical', async () => {
  await signup('login@example.test', 'organizer');
  const success = await call('POST', '/api/auth/login', {
    body: { email: 'login@example.test', password: 'correct horse battery' },
  });
  assert.equal(success.status, 200);
  assert.equal(success.body.user.role, 'organizer');

  const wrongPassword = await call('POST', '/api/auth/login', {
    body: { email: 'login@example.test', password: 'incorrect password' },
  });
  const unknownEmail = await call('POST', '/api/auth/login', {
    body: { email: 'missing@example.test', password: 'incorrect password' },
  });
  assert.deepEqual(wrongPassword, unknownEmail);
  assert.equal(wrongPassword.status, 401);
  assert.deepEqual(wrongPassword.body.error, {
    code: 'INVALID_CREDENTIALS',
    message: 'Invalid email or password',
  });
});

test('me requires a valid, unedited and unexpired token', async () => {
  const { token } = await signup('protected@example.test');
  assert.equal((await call('GET', '/api/auth/me')).body.error.code, 'UNAUTHENTICATED');
  const [header, , signature] = token.split('.');
  const tampered = `${header}.${Buffer.from('{"sub":"forged"}').toString('base64url')}.${signature}`;
  assert.equal((await call('GET', '/api/auth/me', { token: tampered })).body.error.code, 'UNAUTHENTICATED');

  const expired = signToken({ sub: 'any-user', role: 'attendee', email: 'expired@example.test' }, -1);
  assert.equal((await call('GET', '/api/auth/me', { token: expired })).body.error.code, 'UNAUTHENTICATED');
  assert.ok(verifyToken(token));
});

test('server role checks prevent an attendee from creating events', async () => {
  const { token } = await signup('wrong-role@example.test');
  const response = await call('POST', '/api/events', {
    token,
    body: { title: 'Private event', city: 'Lagos', venue: 'Hall', startsAt: '2027-01-01T10:00:00Z' },
  });
  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, 'FORBIDDEN');
});

test("one organizer cannot change another organizer's event", async () => {
  const owner = await signup('organizer-owner@example.test', 'organizer');
  const other = await signup('organizer-other@example.test', 'organizer');
  const event = await call('POST', '/api/events', {
    token: owner.token,
    body: { title: 'Owned event', city: 'Lagos', venue: 'Hall', startsAt: '2027-01-01T10:00:00Z' },
  });
  const forbidden = await call('POST', `/api/events/${event.body.id}/tiers`, {
    token: other.token,
    body: { name: 'General', priceCents: 500, capacity: 2 },
  });
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.body.error.code, 'FORBIDDEN');
});

test('attendees see only their own bookings', async () => {
  const organizer = await signup('owner@example.test', 'organizer');
  const attendeeA = await signup('booking-a@example.test');
  const attendeeB = await signup('booking-b@example.test');

  const event = await call('POST', '/api/events', {
    token: organizer.token,
    body: { title: 'Test event', city: 'Lagos', venue: 'Hall', startsAt: '2027-01-01T10:00:00Z' },
  });
  const tier = await call('POST', `/api/events/${event.body.id}/tiers`, {
    token: organizer.token,
    body: { name: 'General', priceCents: 500, capacity: 2 },
  });
  await call('POST', `/api/events/${event.body.id}/publish`, { token: organizer.token });
  const booking = await call('POST', '/api/bookings', {
    token: attendeeA.token,
    body: { tierId: tier.body.id, quantity: 1 },
  });

  const hidden = await call('GET', `/api/bookings/${booking.body.reference}`, { token: attendeeB.token });
  assert.equal(hidden.status, 404);
  assert.equal(hidden.body.error.code, 'NOT_FOUND');
  assert.deepEqual((await call('GET', '/api/bookings', { token: attendeeB.token })).body.bookings, []);
  assert.equal((await call('GET', '/api/bookings', { token: attendeeA.token })).body.bookings[0].reference, booking.body.reference);
});

test('token verification rejects an unsupported algorithm header', () => {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: 'someone',
    role: 'attendee',
    email: 'someone@example.test',
    exp: Math.floor(Date.now() / 1000) + 60,
  })).toString('base64url');
  const signature = createHmac('sha256', process.env.JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');
  assert.equal(verifyToken(`${header}.${payload}.${signature}`), null);
});
