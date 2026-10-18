import type { TripSummaryDTO } from '@trailogue/contracts';
import type { TripRecord, TripRepository } from '@trailogue/database';
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';

import { HttpError } from '../errors/httpError.js';

const uuidParameterSchema = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } },
} as const;

const tripListQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    cursor: { type: 'string', minLength: 1, maxLength: 512 },
    limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
  },
} as const;

export async function registerTripRoutes(
  app: FastifyInstance,
  authenticate: preHandlerHookHandler,
  trips: Pick<TripRepository, 'findByIdForUser' | 'listForUser'>,
) {
  app.get(
    '/v1/trips',
    {
      schema: { tags: ['trips'], security: [{ bearerAuth: [] }], querystring: tripListQuerySchema },
      preHandler: authenticate,
    },
    async (request) => {
      const query = request.query as { cursor?: string; limit?: number };
      const limit = query.limit ?? 20;
      const cursor = query.cursor ? decodeCursor(query.cursor) : null;
      const records = await trips.listForUser({
        userId: request.authentication!.userId,
        cursor,
        limit: limit + 1,
      });
      const hasNextPage = records.length > limit;
      const page = records.slice(0, limit);
      return {
        data: page.map(toTripDto),
        meta: { nextCursor: hasNextPage ? encodeCursor(page.at(-1)!) : null },
      };
    },
  );

  app.get(
    '/v1/trips/:id',
    {
      schema: { tags: ['trips'], security: [{ bearerAuth: [] }], params: uuidParameterSchema },
      preHandler: authenticate,
    },
    async (request) => {
      const { id } = request.params as { id: string };
      const trip = await trips.findByIdForUser(id, request.authentication!.userId);
      if (!trip) throw new HttpError(404, 'NOT_FOUND', 'Trip not found');
      return { data: toTripDto(trip) };
    },
  );
}

function toTripDto(trip: TripRecord): TripSummaryDTO {
  return {
    id: trip.id,
    title: trip.title,
    description: trip.description,
    destinationName: trip.destinationName,
    status: trip.status,
    coverPhotoId: trip.coverPhotoId,
    photoCount: trip.photoCount,
    startDate: trip.startDate,
    endDate: trip.endDate,
    createdAt: trip.createdAt.toISOString(),
    updatedAt: trip.updatedAt.toISOString(),
  };
}

function encodeCursor(trip: TripRecord): string {
  return Buffer.from(JSON.stringify({ updatedAt: trip.updatedAt.toISOString(), id: trip.id }))
    .toString('base64url');
}

function decodeCursor(value: string): { updatedAt: Date; id: string } {
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
    if (
      typeof decoded !== 'object' ||
      decoded === null ||
      !('updatedAt' in decoded) ||
      !('id' in decoded) ||
      typeof decoded.updatedAt !== 'string' ||
      typeof decoded.id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        decoded.id,
      )
    ) {
      throw new Error('Invalid cursor');
    }
    const updatedAt = new Date(decoded.updatedAt);
    if (!Number.isFinite(updatedAt.getTime())) throw new Error('Invalid cursor');
    return { updatedAt, id: decoded.id };
  } catch {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Cursor is invalid');
  }
}
