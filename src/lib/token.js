import crypto from 'node:crypto';

const SECRET = process.env.JWT_SECRET || 'capstone-default-secure-secret-2026';

function base64UrlEncode(str) {
    return Buffer.from(str).toString('base64url');
}

function base64UrlDecode(str) {
    return Buffer.from(str, 'base64url').toString('utf8');
}

export function signToken(payload, expiresInSeconds = 86400) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const data = {
        ...payload,
        exp: Math.floor(Date.now() / 1000) + expiresInSeconds
    };

    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(data));
    
    const signature = crypto
        .createHmac('sha256', SECRET)
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest('base64url');

    return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export function verifyToken(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, signature] = parts;

    try {
        const header = JSON.parse(base64UrlDecode(encodedHeader));
        if (header.alg !== 'HS256') {
            return null; // Reject non-HS256 algorithms
        }

        const expectedSignature = crypto
            .createHmac('sha256', SECRET)
            .update(`${encodedHeader}.${encodedPayload}`)
            .digest('base64url');

        if (signature !== expectedSignature) {
            return null;
        }

        const payload = JSON.parse(base64UrlDecode(encodedPayload));
        if (payload.exp && Date.now() >= payload.exp * 1000) {
            return null; // Expired token
        }

        return payload;
    } catch (e) {
        return null;
    }
}