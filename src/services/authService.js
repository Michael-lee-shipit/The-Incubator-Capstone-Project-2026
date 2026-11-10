import { hashPassword, verifyPassword } from '../lib/password.js';
import { signToken } from '../lib/token.js';
import { newId } from '../domain/ids.js';

// In-memory or repository user store accessor (adjust based on your UserRepository if you have one)
// Assuming a user repository module exists or standard data store structure:
export function createAuthService({ userRepository }) {
    return {
        async signup({ email, password, role = 'attendee' }) {
            if (!email || !password) {
                const err = new Error('Email and password are required');
                err.code = 'VALIDATION_ERROR';
                throw err;
            }

            if (password.length < 8) {
                const err = new Error('Password must be at least 8 characters long');
                err.code = 'INVALID_PASSWORD';
                throw err;
            }

            const validRoles = ['attendee', 'organizer', 'staff'];
            if (!validRoles.includes(role)) {
                const err = new Error('Invalid user role');
                err.code = 'INVALID_ROLE';
                throw err;
            }

            // Check if email already exists
            const existingUser = await userRepository.findByEmail(email);
            if (existingUser) {
                const err = new Error('Email is already registered');
                err.code = 'EMAIL_TAKEN';
                throw err;
            }

            const passwordHash = await hashPassword(password);
            const user = {
                id: `usr_${newId()}`,
                email: email.toLowerCase().trim(),
                passwordHash,
                role,
                createdAt: new Date().toISOString()
            };

            await userRepository.create(user);

            // Generate signed token
            const token = signToken({ sub: user.id, role: user.role, email: user.email });

            // Return user object without sensitive password hash
            const { passwordHash: _, ...safeUser } = user;
            return { token, user: safeUser };
        },

        async login({ email, password }) {
            const genericError = new Error('Invalid credentials');
            genericError.code = 'INVALID_CREDENTIALS';

            if (!email || !password) {
                throw genericError;
            }

            const user = await userRepository.findByEmail(email.toLowerCase().trim());
            if (!user) {
                // Prevent user enumeration: use timing-safe mock check or direct failure matching same error code
                throw genericError;
            }

            const isValid = await verifyPassword(password, user.passwordHash);
            if (!isValid) {
                throw genericError;
            }

            const token = signToken({ sub: user.id, role: user.role, email: user.email });

            const { passwordHash: _, ...safeUser } = user;
            return { token, user: safeUser };
        },

        async getById(userId) {
            const user = await userRepository.findById(userId);
            if (!user) return null;
            const { passwordHash: _, ...safeUser } = user;
            return safeUser;
        }
    };
}