import { randomUUID } from 'node:crypto';

import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyServerOptions } from 'fastify';

import { HttpError, sendError } from './errors/httpError.js';
import { registerPlannedRoutes } from './routes/planned.js';
import { registerSystemRoutes, type ReadinessDependency } from './routes/system.js';

interface BuildAppOptions {
  readiness: ReadinessDependency;
  logger?: FastifyServerOptions['logger'];
}

export async function buildApp({ readiness, logger = false }: BuildAppOptions) {
  const app = Fastify({
    logger,
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID(),
  });

  await app.register(swagger, {
    openapi: {
      info: { title: 'Trailogue API', version: '1.0.0' },
      servers: [{ url: 'http://localhost:3000', description: 'Local development' }],
      tags: [
        { name: 'system' },
        { name: 'auth' },
        { name: 'users' },
        { name: 'trips' },
      ],
    },
  });
  await app.register(swaggerUi, { routePrefix: '/documentation' });

  app.addHook('onRequest', async (request, reply) => {
    void reply.header('x-request-id', request.id);
  });

  app.setErrorHandler((error, request, reply) => {
    if (typeof error === 'object' && error !== null && 'validation' in error) {
      return sendError(reply, request, 400, 'VALIDATION_ERROR', 'Request validation failed');
    }
    if (error instanceof HttpError) {
      return sendError(reply, request, error.statusCode, error.code, error.message);
    }
    request.log.error({ error }, 'Unhandled request error');
    return sendError(reply, request, 500, 'INTERNAL_ERROR', 'An internal error occurred');
  });

  app.setNotFoundHandler((request, reply) =>
    sendError(reply, request, 404, 'NOT_FOUND', 'Route not found'),
  );

  await registerSystemRoutes(app, readiness);
  await registerPlannedRoutes(app);
  return app;
}
