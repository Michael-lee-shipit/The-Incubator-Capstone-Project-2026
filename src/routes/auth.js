import express from 'express';
import { requireUser } from '../http/guards.js';

export function createAuthRouter({ authService }) {
    const router = express.Router();

    router.post('/signup', async (req, res, next) => {
        try {
            const { email, password, role } = req.body;
            const result = await authService.signup({ email, password, role });
            res.status(201).json(result);
        } catch (err) {
            if (err.code === 'EMAIL_TAKEN') {
                return res.status(400).json({ error: { code: 'EMAIL_TAKEN', message: err.message } });
            }
            if (err.code === 'INVALID_PASSWORD' || err.code === 'VALIDATION_ERROR' || err.code === 'INVALID_ROLE') {
                return res.status(400).json({ error: { code: err.code, message: err.message } });
            }
            next(err);
        }
    });

    router.post('/login', async (req, res, next) => {
        try {
            const { email, password } = req.body;
            const result = await authService.login({ email, password });
            res.json(result);
        } catch (err) {
            if (err.code === 'INVALID_CREDENTIALS') {
                // Must return identical error for unknown email and wrong password
                return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' } });
            }
            next(err);
        }
    });

    router.get('/me', requireUser(), async (req, res, next) => {
        try {
            const user = await authService.getById(req.user.sub);
            if (!user) {
                return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
            }
            res.json({ user });
        } catch (err) {
            next(err);
        }
    });

    return router;
}