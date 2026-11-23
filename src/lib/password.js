import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password) {
  if (typeof password !== 'string') throw new TypeError('Password must be a string');
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);
  return `scrypt$16384$8$1$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password, storedHash) {
  if (typeof password !== 'string' || typeof storedHash !== 'string') return false;
  const parts = storedHash.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, cost, blockSize, parallelization, saltHex, keyHex] = parts;
  if (cost !== '16384' || blockSize !== '8' || parallelization !== '1') return false;
  if (!/^[0-9a-f]{32}$/i.test(saltHex) || !/^[0-9a-f]{128}$/i.test(keyHex)) return false;

  const expected = Buffer.from(keyHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), KEY_LENGTH, SCRYPT_OPTIONS);
  return timingSafeEqual(expected, actual);
}
