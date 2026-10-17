import type { FastifyInstance, FastifyRequest } from 'fastify';

import { sendError } from '../errors/httpError.js';

const uuidParameterSchema = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } },
} as const;

function notImplemented(request: FastifyRequest, reply: Parameters<typeof sendError>[0]) {
  return sendError(reply, request, 501, 'NOT_IMPLEMENTED', 'Endpoint is defined but not active in Phase A');
}

export async function registerPlannedRoutes(app: FastifyInstance) {
  app.post(
    '/v1/auth/apple',
    {
      schema: {
        tags: ['auth'],
        description: 'Phase A contract only. Real Apple token verification is implemented in Phase B.',
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['identityToken', 'nonce'],
          properties: {
            identityToken: { type: 'string', minLength: 1 },
            authorizationCode: { type: ['string', 'null'] },
            nonce: { type: 'string', minLength: 16 },
            profile: { type: 'object' },
          },
        },
      },
    },
    async (request, reply) => notImplemented(request, reply),
  );

  app.get('/v1/users/me', { schema: { tags: ['users'] } }, async (request, reply) =>
    notImplemented(request, reply),
  );

  app.get('/v1/trips', { schema: { tags: ['trips'] } }, async (request, reply) =>
    notImplemented(request, reply),
  );

  app.get(
    '/v1/trips/:id',
    { schema: { tags: ['trips'], params: uuidParameterSchema } },
    async (request, reply) => notImplemented(request, reply),
  );
}
