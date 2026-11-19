import { createHmac, timingSafeEqual } from 'node:crypto';

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (typeof secret !== 'string' || secret.length === 0) {
    throw new Error('JWT_SECRET must be set in the environment');
  }
  return secret;
}

export function validateTokenSecret() {
  getSecret();
}

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function signToken(payload, expiresInSeconds = 86400) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('Token payload must be an object');
  }
  if (!Number.isInteger(expiresInSeconds)) {
    throw new TypeError('Token expiry must be a whole number of seconds');
  }

  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const claims = encode({ ...payload, exp: Math.floor(Date.now() / 1000) + expiresInSeconds });
  const unsigned = `${header}.${claims}`;
  const signature = createHmac('sha256', getSecret()).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

export function verifyToken(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => !part)) return null;
  const secret = getSecret();

  try {
    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8'));
    if (!header || header.alg !== 'HS256') return null;

    const expected = createHmac('sha256', secret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest();
    const actual = Buffer.from(encodedSignature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    if (!Number.isInteger(payload.exp) || Date.now() >= payload.exp * 1000) return null;
    return payload;
  } catch {
    return null;
  }
}
