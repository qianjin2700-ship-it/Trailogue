import type { GenerateStoryRequest, UpdateStoryRequest } from '@trailogue/contracts';
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';

import type { StoryService } from '../modules/stories/storyService.js';

const tripParameterSchema = {
  type: 'object', required: ['tripId'],
  properties: { tripId: { type: 'string', format: 'uuid' } },
} as const;

export async function registerStoryRoutes(
  app: FastifyInstance,
  authenticate: preHandlerHookHandler,
  stories: Pick<StoryService, 'generate' | 'update' | 'latest' | 'versions' | 'bookPreview'>,
) {
  app.post(
    '/v1/trips/:tripId/story/generate',
    {
      bodyLimit: 32 * 1024,
      schema: {
        tags: ['stories'], security: [{ bearerAuth: [] }], params: tripParameterSchema,
        body: {
          type: 'object', additionalProperties: false,
          properties: { feedback: { type: ['string', 'null'], maxLength: 2_000 } },
        },
      },
      onRequest: authenticate,
    },
    async (request, reply) => {
      const { tripId } = request.params as { tripId: string };
      const body = request.body as GenerateStoryRequest;
      const result = await stories.generate(
        request.authentication!.userId,
        tripId,
        body.feedback?.trim() || null,
      );
      return reply.code(201).send({ data: result });
    },
  );

  app.get(
    '/v1/trips/:tripId/story',
    {
      schema: { tags: ['stories'], security: [{ bearerAuth: [] }], params: tripParameterSchema },
      onRequest: authenticate,
    },
    async (request) => {
      const { tripId } = request.params as { tripId: string };
      return { data: await stories.latest(request.authentication!.userId, tripId) };
    },
  );

  app.put(
    '/v1/trips/:tripId/story',
    {
      bodyLimit: 256 * 1024,
      schema: {
        tags: ['stories'], security: [{ bearerAuth: [] }], params: tripParameterSchema,
        body: {
          type: 'object', additionalProperties: false, required: ['content'],
          properties: { content: { type: 'object' } },
        },
      },
      onRequest: authenticate,
    },
    async (request, reply) => {
      const { tripId } = request.params as { tripId: string };
      const { content } = request.body as UpdateStoryRequest;
      return reply.code(201).send({
        data: await stories.update(request.authentication!.userId, tripId, content),
      });
    },
  );

  app.get(
    '/v1/trips/:tripId/stories',
    {
      schema: { tags: ['stories'], security: [{ bearerAuth: [] }], params: tripParameterSchema },
      onRequest: authenticate,
    },
    async (request) => {
      const { tripId } = request.params as { tripId: string };
      return { data: await stories.versions(request.authentication!.userId, tripId) };
    },
  );

  app.get(
    '/v1/trips/:tripId/book',
    {
      schema: { tags: ['books'], security: [{ bearerAuth: [] }], params: tripParameterSchema },
      onRequest: authenticate,
    },
    async (request) => {
      const { tripId } = request.params as { tripId: string };
      return { data: await stories.bookPreview(request.authentication!.userId, tripId) };
    },
  );
}
