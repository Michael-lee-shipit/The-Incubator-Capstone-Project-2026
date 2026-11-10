import crypto from 'node:crypto';

// Hash password with scrypt and a random salt
export async function hashPassword(password) {
    return new Promise((resolve, reject) => {
        const salt = crypto.randomBytes(16).toString('hex');
        crypto.scrypt(password, salt, 64, (err, derivedKey) => {
            if (err) reject(err);
            resolve(`${salt}:${derivedKey.toString('hex')}`);
        });
    });
}

// Verify password against stored hash using constant-time comparison
export async function verifyPassword(password, storedHash) {
    return new Promise((resolve, reject) => {
        const [salt, key] = storedHash.split(':');
        if (!salt || !key) return resolve(false);
        
        const keyBuffer = Buffer.from(key, 'hex');
        crypto.scrypt(password, salt, 64, (err, derivedKey) => {
            if (err) reject(err);
            try {
                const match = crypto.timingSafeEqual(keyBuffer, derivedKey);
                resolve(match);
            } catch (e) {
                resolve(false);
            }
        });
    });
}