import { requireUser } from '../http/guards.js';
import { DomainError } from '../domain/errors.js';

export function registerAuthRoutes(router, { authService }) {
  router.post('/api/auth/signup', async ({ body }) => ({
    status: 201,
    body: await authService.signup(body),
  }));

  router.post('/api/auth/login', async ({ body }) => ({
    status: 200,
    body: await authService.login(body),
  }));

  router.get('/api/auth/me', async ({ request }) => {
    const user = await authService.getById(requireUser(request).id);
    if (!user) throw new DomainError('UNAUTHENTICATED', 'A valid bearer token is required');
    return { status: 200, body: { user } };
  });

  return router;
}
