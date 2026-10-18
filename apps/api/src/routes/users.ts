import type { UserRepository } from '@trailogue/database';
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';

import { HttpError } from '../errors/httpError.js';
import { toUserDto } from './auth.js';

export async function registerUserRoutes(
  app: FastifyInstance,
  authenticate: preHandlerHookHandler,
  users: Pick<UserRepository, 'findById'>,
) {
  app.get(
    '/v1/users/me',
    { schema: { tags: ['users'], security: [{ bearerAuth: [] }] }, preHandler: authenticate },
    async (request) => {
      const user = await users.findById(request.authentication!.userId);
      if (!user) throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required');
      return { data: toUserDto(user) };
    },
  );
}
