import { DomainError } from '../domain/errors.js';
import { newId } from '../domain/ids.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { signToken } from '../lib/token.js';

const ROLES = new Set(['attendee', 'organizer', 'staff']);

function publicUser(user) {
  const { passwordHash, ...visible } = user;
  return visible;
}

function credentialsError() {
  return new DomainError('INVALID_CREDENTIALS', 'Invalid email or password');
}

export function createAuthService({ repository, now = () => new Date() }) {
  if (!repository) throw new TypeError('An auth repository is required');

  async function issueSession(user) {
    return {
      token: signToken({ sub: user.id, role: user.role, email: user.email }),
      user: publicUser(user),
    };
  }

  return {
    async signup(input) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new DomainError('VALIDATION', 'Request body must be a JSON object');
      }
      const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
      const { password } = input;
      const role = input.role ?? 'attendee';

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new DomainError('VALIDATION', 'A valid email is required');
      }
      if (typeof password !== 'string' || password.length < 8) {
        throw new DomainError('VALIDATION', 'Password must be at least 8 characters long');
      }
      if (!ROLES.has(role)) throw new DomainError('VALIDATION', 'Role must be attendee, organizer or staff');
      if (await repository.findUserByEmail(email)) {
        throw new DomainError('EMAIL_TAKEN', 'An account already exists for this email');
      }

      const user = {
        id: `usr_${newId()}`,
        email,
        role,
        passwordHash: await hashPassword(password),
        createdAt: now().toISOString(),
      };
      try {
        await repository.createUser(user);
      } catch (error) {
        if (error.code === 'ERR_SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint failed: users\.email/i.test(error.message)) {
          throw new DomainError('EMAIL_TAKEN', 'An account already exists for this email');
        }
        throw error;
      }
      return issueSession(user);
    },

    async login(input) {
      const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
      const password = input?.password;
      if (!email || typeof password !== 'string') throw credentialsError();

      const user = await repository.findUserByEmail(email);
      if (!user || !(await verifyPassword(password, user.passwordHash))) throw credentialsError();
      return issueSession(user);
    },

    async getById(userId) {
      const user = await repository.findUserById(userId);
      return user ? publicUser(user) : null;
    },
  };
}
