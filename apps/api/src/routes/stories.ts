import type { GenerateStoryRequest, UpdateBookLayoutRequest, UpdateStoryRequest } from '@trailogue/contracts';
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';

import type { StoryService } from '../modules/stories/storyService.js';

const tripParameterSchema = {
  type: 'object', required: ['tripId'],
  properties: { tripId: { type: 'string', format: 'uuid' } },
} as const;

export async function registerStoryRoutes(
  app: FastifyInstance,
  authenticate: preHandlerHookHandler,
  stories: Pick<StoryService, 'generate' | 'update' | 'latest' | 'versions' | 'restore' | 'bookPreview' | 'updateBookLayout'>,
) {
  app.post(
    '/v1/trips/:tripId/story/generate',
    {
      bodyLimit: 32 * 1024,
      schema: {
        tags: ['stories'], security: [{ bearerAuth: [] }], params: tripParameterSchema,
        body: {
          type: 'object', additionalProperties: false,
          required: ['confirmed'],
          properties: {
            feedback: { type: ['string', 'null'], maxLength: 2_000 },
            confirmed: { const: true },
            fallbackLanguage: { type: 'string', enum: ['zh-Hans', 'zh-Hant', 'en', 'ja', 'ko'] },
          },
        },
      },
      onRequest: authenticate,
    },
    async (request, reply) => {
      const { tripId } = request.params as { tripId: string };
      const body = request.body as GenerateStoryRequest;
      const startedAt = Date.now();
      request.log.info({ requestId: request.id, tripId }, 'Story generation started');
      try {
        const result = await stories.generate(
          request.authentication!.userId,
          tripId,
          body.feedback?.trim() || null,
          body.fallbackLanguage,
        );
        request.log.info({
          requestId: request.id,
          tripId,
          durationMs: Date.now() - startedAt,
          storyVersion: result.version,
        }, 'Story generation completed');
        return reply.code(201).send({ data: result });
      } catch (error) {
        request.log.warn({
          requestId: request.id,
          tripId,
          durationMs: Date.now() - startedAt,
          errorName: error instanceof Error ? error.name : 'UnknownError',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        }, 'Story generation failed');
        throw error;
      }
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

  app.post(
    '/v1/trips/:tripId/stories/:storyId/restore',
    {
      schema: {
        tags: ['stories'], security: [{ bearerAuth: [] }], params: {
          type: 'object', required: ['tripId', 'storyId'],
          properties: {
            tripId: { type: 'string', format: 'uuid' },
            storyId: { type: 'string', format: 'uuid' },
          },
        },
      },
      onRequest: authenticate,
    },
    async (request, reply) => {
      const { tripId, storyId } = request.params as { tripId: string; storyId: string };
      return reply.code(201).send({
        data: await stories.restore(request.authentication!.userId, tripId, storyId),
      });
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

  app.put(
    '/v1/trips/:tripId/book/layout',
    {
      bodyLimit: 256 * 1024,
      schema: {
        tags: ['books'], security: [{ bearerAuth: [] }], params: tripParameterSchema,
        body: {
          type: 'object', additionalProperties: false, required: ['layout'],
          properties: { layout: { type: 'object' } },
        },
      },
      onRequest: authenticate,
    },
    async (request) => {
      const { tripId } = request.params as { tripId: string };
      const { layout } = request.body as UpdateBookLayoutRequest;
      return { data: await stories.updateBookLayout(request.authentication!.userId, tripId, layout) };
    },
  );
}
