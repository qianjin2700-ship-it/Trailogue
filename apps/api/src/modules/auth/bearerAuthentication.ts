import type { FastifyRequest } from 'fastify';

import { HttpError } from '../../errors/httpError.js';
import type { SessionService } from './sessionService.js';

export interface RequestAuthentication {
  sessionId: string;
  userId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    authentication: RequestAuthentication | null;
  }
}

export function createBearerAuthenticator(sessions: Pick<SessionService, 'verify'>) {
  return async function authenticate(request: FastifyRequest) {
    const authorization = request.headers.authorization;
    const match = authorization?.match(/^Bearer ([A-Za-z0-9_-]{32,512})$/);
    const token = match?.[1];
    if (!token) throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required');

    const session = await sessions.verify(token);
    if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required');
    request.authentication = { sessionId: session.id, userId: session.userId };
  };
}
