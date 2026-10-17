import type { ApiErrorCode, ApiErrorResponse } from '@trailogue/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function sendError(
  reply: FastifyReply,
  request: FastifyRequest,
  statusCode: number,
  code: ApiErrorCode,
  message: string,
) {
  const body: ApiErrorResponse = {
    error: { code, message, requestId: request.id },
  };
  return reply.status(statusCode).send(body);
}
