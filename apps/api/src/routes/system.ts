import type { FastifyInstance } from 'fastify';

import { sendError } from '../errors/httpError.js';

export interface ReadinessDependency {
  healthCheck(): Promise<void>;
}

export async function registerSystemRoutes(
  app: FastifyInstance,
  readiness: ReadinessDependency,
) {
  app.get(
    '/health',
    {
      schema: {
        tags: ['system'],
        response: {
          200: {
            type: 'object',
            required: ['data'],
            properties: {
              data: {
                type: 'object',
                required: ['status'],
                properties: { status: { type: 'string', const: 'ok' } },
              },
            },
          },
        },
      },
    },
    async () => ({ data: { status: 'ok' } }),
  );

  app.get('/ready', { schema: { tags: ['system'] } }, async (request, reply) => {
    try {
      await readiness.healthCheck();
      return { data: { status: 'ready' } };
    } catch {
      return sendError(reply, request, 503, 'INTERNAL_ERROR', 'Service is not ready');
    }
  });
}
