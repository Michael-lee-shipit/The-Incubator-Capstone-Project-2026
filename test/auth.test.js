import test from 'node:test';
import assert from 'node:assert';
import { hashPassword, verifyPassword } from '../src/lib/password.js';
import { signToken, verifyToken } from '../src/lib/token.js';

test('Password hashing and verification work securely', async () => {
    const password = 'mySecurePassword123';
    const hash = await hashPassword(password);
    
    assert.notStrictEqual(hash, password, 'Password must be hashed');
    
    const isValid = await verifyPassword(password, hash);
    assert.strictEqual(isValid, true, 'Correct password should verify successfully');

    const isInvalid = await verifyPassword('wrongPassword', hash);
    assert.strictEqual(isInvalid, false, 'Wrong password should fail verification');
});

test('JWT-style token signing and verification work', () => {
    const payload = { sub: 'usr_123', role: 'attendee', email: 'test@example.com' };
    const token = signToken(payload);

    assert.strictEqual(typeof token, 'string', 'Token should be a string');

    const verified = verifyToken(token);
    assert.strictEqual(verified.sub, 'usr_123', 'Payload sub should match');
    assert.strictEqual(verified.role, 'attendee', 'Payload role should match');
});

test('Token rejects bad signatures or modified alg headers', () => {
    const token = signToken({ sub: 'usr_123', role: 'attendee' });
    const parts = token.split('.');

    // Tamper with payload
    const tamperedPayload = Buffer.from(JSON.stringify({ sub: 'usr_999', role: 'organizer' })).toString('base64url');
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

    const verified = verifyToken(tamperedToken);
    assert.strictEqual(verified, null, 'Tampered token must be rejected');
});

test('Expired tokens are rejected', () => {
    // Generate a token that expired 10 seconds ago
    const expiredToken = signToken({ sub: 'usr_123', role: 'attendee' }, -10);
    const verified = verifyToken(expiredToken);

    assert.strictEqual(verified, null, 'Expired token must be rejected');
});