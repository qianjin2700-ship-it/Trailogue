import type { UpdateUserSettingsRequest } from '@trailogue/contracts';
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';

import { HttpError } from '../errors/httpError.js';
import { toUserDto } from './auth.js';
import type { UserService } from '../modules/users/userService.js';

export async function registerUserRoutes(
  app: FastifyInstance,
  authenticate: preHandlerHookHandler,
  users: Pick<UserService, 'findById' | 'update' | 'deleteAccount'>,
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
  app.patch(
    '/v1/users/me',
    {
      schema: {
        tags: ['users'], security: [{ bearerAuth: [] }],
        body: {
          type: 'object', additionalProperties: false, minProperties: 1,
          properties: {
            displayName: { type: ['string', 'null'], maxLength: 160 },
            retentionDays: { type: 'integer', minimum: -1, maximum: 3650 },
            privacyAgreed: { type: 'boolean' },
          },
        },
      },
      preHandler: authenticate,
    },
    async (request) => ({
      data: toUserDto(await users.update(
        request.authentication!.userId,
        request.body as UpdateUserSettingsRequest,
      )),
    }),
  );
  app.delete(
    '/v1/users/me',
    {
      schema: {
        tags: ['users'], security: [{ bearerAuth: [] }],
        body: {
          type: 'object', additionalProperties: false, required: ['confirmation'],
          properties: { confirmation: { type: 'string', const: 'DELETE' } },
        },
      },
      preHandler: authenticate,
    },
    async (request) => {
      await users.deleteAccount(request.authentication!.userId);
      return { data: { deleted: true } };
    },
  );
}
