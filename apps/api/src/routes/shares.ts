import type { FastifyInstance, preHandlerHookHandler } from 'fastify';

import { renderSharedStoryHtml, type ShareService } from '../modules/shares/shareService.js';

const tripParameters = {
  type: 'object', required: ['tripId'],
  properties: { tripId: { type: 'string', format: 'uuid' } },
} as const;
const shareParameters = {
  type: 'object', required: ['shareId'],
  properties: { shareId: { type: 'string', format: 'uuid' } },
} as const;
const tokenParameters = {
  type: 'object', required: ['token'],
  properties: { token: { type: 'string', pattern: '^[A-Za-z0-9_-]{43}$' } },
} as const;

export async function registerShareRoutes(
  app: FastifyInstance,
  authenticate: preHandlerHookHandler,
  shares: Pick<ShareService, 'create' | 'revoke' | 'resolve'>,
) {
  app.post(
    '/v1/trips/:tripId/shares',
    {
      schema: { tags: ['shares'], security: [{ bearerAuth: [] }], params: tripParameters },
      onRequest: authenticate,
    },
    async (request, reply) => {
      const { tripId } = request.params as { tripId: string };
      return reply.code(201).send({ data: await shares.create(request.authentication!.userId, tripId) });
    },
  );
  app.delete(
    '/v1/shares/:shareId',
    {
      schema: { tags: ['shares'], security: [{ bearerAuth: [] }], params: shareParameters },
      onRequest: authenticate,
    },
    async (request) => {
      const { shareId } = request.params as { shareId: string };
      await shares.revoke(request.authentication!.userId, shareId);
      return { data: { revoked: true } };
    },
  );
  app.get(
    '/v1/shared/:token',
    { schema: { tags: ['shares'], params: tokenParameters } },
    async (request) => {
      const { token } = request.params as { token: string };
      return { data: await shares.resolve(token) };
    },
  );
  app.get(
    '/share/:token',
    { schema: { tags: ['shares'], params: tokenParameters } },
    async (request, reply) => {
      const { token } = request.params as { token: string };
      return reply.type('text/html; charset=utf-8').send(renderSharedStoryHtml(await shares.resolve(token)));
    },
  );
}
