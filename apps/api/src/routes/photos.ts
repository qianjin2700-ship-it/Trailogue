import type { CreatePhotoUploadRequest } from '@trailogue/contracts';
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';

import type { PhotoService } from '../modules/photos/photoService.js';

const tripParameterSchema = {
  type: 'object', required: ['tripId'],
  properties: { tripId: { type: 'string', format: 'uuid' } },
} as const;

const photoParameterSchema = {
  type: 'object', required: ['tripId', 'photoId'],
  properties: {
    tripId: { type: 'string', format: 'uuid' },
    photoId: { type: 'string', format: 'uuid' },
  },
} as const;

const idempotencyHeadersSchema = {
  type: 'object', required: ['idempotency-key'],
  properties: { 'idempotency-key': { type: 'string', format: 'uuid' } },
} as const;

const uploadBodySchema = {
  type: 'object', additionalProperties: false,
  required: ['clientUploadId', 'originalFilename', 'mimeType', 'fileSize', 'width', 'height'],
  properties: {
    clientUploadId: { type: 'string', format: 'uuid' },
    originalFilename: { type: 'string', minLength: 1, maxLength: 255 },
    mimeType: { type: 'string', enum: ['image/jpeg', 'image/png'] },
    fileSize: { type: 'integer', minimum: 1 },
    width: { type: 'integer', minimum: 1 },
    height: { type: 'integer', minimum: 1 },
  },
} as const;

export async function registerPhotoRoutes(
  app: FastifyInstance,
  authenticate: preHandlerHookHandler,
  photos: Pick<PhotoService, 'createUploadIntent' | 'completeUpload' | 'listPhotos'>,
) {
  app.post(
    '/v1/trips/:tripId/photos/uploads',
    {
      bodyLimit: 16 * 1024,
      schema: {
        tags: ['photos'], security: [{ bearerAuth: [] }],
        params: tripParameterSchema, headers: idempotencyHeadersSchema, body: uploadBodySchema,
      },
      onRequest: authenticate,
    },
    async (request, reply) => {
      const { tripId } = request.params as { tripId: string };
      const result = await photos.createUploadIntent(
        request.authentication!.userId,
        tripId,
        request.body as CreatePhotoUploadRequest,
        request.headers['idempotency-key'] as string,
      );
      return reply.code(201).send({ data: result });
    },
  );

  app.post(
    '/v1/trips/:tripId/photos/:photoId/complete',
    {
      schema: {
        tags: ['photos'], security: [{ bearerAuth: [] }], params: photoParameterSchema,
      },
      onRequest: authenticate,
    },
    async (request) => {
      const { tripId, photoId } = request.params as { tripId: string; photoId: string };
      return { data: await photos.completeUpload(request.authentication!.userId, tripId, photoId) };
    },
  );

  app.get(
    '/v1/trips/:tripId/photos',
    {
      schema: {
        tags: ['photos'], security: [{ bearerAuth: [] }], params: tripParameterSchema,
      },
      preHandler: authenticate,
    },
    async (request) => {
      const { tripId } = request.params as { tripId: string };
      return { data: await photos.listPhotos(request.authentication!.userId, tripId) };
    },
  );
}
