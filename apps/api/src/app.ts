import { randomUUID } from 'node:crypto';

import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyServerOptions } from 'fastify';

import { HttpError, sendError } from './errors/httpError.js';
import type { AuthenticationService } from './modules/auth/authService.js';
import { createBearerAuthenticator } from './modules/auth/bearerAuthentication.js';
import type { SessionService } from './modules/auth/sessionService.js';
import type { PhotoService } from './modules/photos/photoService.js';
import type { TripService } from './modules/trips/tripService.js';
import type { UserService } from './modules/users/userService.js';
import type { StoryService } from './modules/stories/storyService.js';
import type { ShareService } from './modules/shares/shareService.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerPhotoRoutes } from './routes/photos.js';
import { registerSystemRoutes, type ReadinessDependency } from './routes/system.js';
import { registerStoryRoutes } from './routes/stories.js';
import { registerShareRoutes } from './routes/shares.js';
import { registerTripRoutes } from './routes/trips.js';
import { registerUserRoutes } from './routes/users.js';

export interface ApiServices {
  authentication: AuthenticationService;
  sessions: Pick<SessionService, 'verify'>;
  photos: Pick<
    PhotoService,
    'createUploadIntent' | 'completeUpload' | 'listPhotos' | 'deletePhoto' | 'reorderPhotos'
    | 'updatePhoto'
  >;
  trips: Pick<
    TripService,
    'create' | 'findByIdForUser' | 'listForUser' | 'updateForUser' | 'deleteForUser'
    | 'setCoverPhoto' | 'updateCreativeRequirementsForUser'
  >;
  stories: Pick<StoryService, 'generate' | 'update' | 'latest' | 'versions' | 'restore' | 'bookPreview' | 'updateBookLayout'>;
  shares: Pick<ShareService, 'create' | 'revoke' | 'resolve'>;
  users: Pick<UserService, 'findById' | 'update' | 'deleteAccount'>;
}

interface BuildAppOptions {
  readiness: ReadinessDependency;
  services: ApiServices;
  logger?: FastifyServerOptions['logger'];
}

export async function buildApp({ readiness, services, logger = false }: BuildAppOptions) {
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
        { name: 'photos' },
        { name: 'stories' },
        { name: 'books' },
        { name: 'shares' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer' },
        },
      },
    },
  });
  await app.register(swaggerUi, { routePrefix: '/documentation' });

  app.addHook('onRequest', async (request, reply) => {
    void reply.header('x-request-id', request.id);
  });
  app.decorateRequest('authentication', null);

  app.setErrorHandler((error, request, reply) => {
    if (typeof error === 'object' && error !== null && 'validation' in error) {
      const issues = validationIssues(error.validation);
      request.log.warn({
        requestId: request.id,
        method: request.method,
        url: request.url,
        validationIssues: issues.map(({ field, keyword }) => ({ field, keyword })),
      }, 'Request validation failed');
      const first = issues[0];
      const message = first
        ? `${humanizeField(first.field)} ${first.reason}.`
        : 'The request contains invalid information.';
      return sendError(reply, request, 400, 'VALIDATION_ERROR', message, {
        issues: issues.map(({ field, reason }) => ({ field, reason })),
      });
    }
    if (error instanceof HttpError) {
      request.log.warn({
        requestId: request.id, method: request.method, url: request.url,
        code: error.code, statusCode: error.statusCode,
      }, 'Request failed');
      return sendError(reply, request, error.statusCode, error.code, error.message);
    }
    request.log.error({ error }, 'Unhandled request error');
    return sendError(reply, request, 500, 'INTERNAL_ERROR', 'An internal error occurred');
  });

  app.setNotFoundHandler((request, reply) =>
    sendError(reply, request, 404, 'NOT_FOUND', 'Route not found'),
  );

  await registerSystemRoutes(app, readiness);
  const authenticate = createBearerAuthenticator(services.sessions);
  await registerAuthRoutes(app, services.authentication);
  await registerUserRoutes(app, authenticate, services.users);
  await registerTripRoutes(app, authenticate, services.trips);
  await registerPhotoRoutes(app, authenticate, services.photos);
  await registerStoryRoutes(app, authenticate, services.stories);
  await registerShareRoutes(app, authenticate, services.shares);
  return app;
}

interface SafeValidationIssue {
  field: string;
  keyword: string;
  reason: string;
}

function validationIssues(value: unknown): SafeValidationIssue[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): SafeValidationIssue[] => {
    if (typeof entry !== 'object' || entry === null) return [];
    const issue = entry as {
      instancePath?: unknown;
      keyword?: unknown;
      params?: { missingProperty?: unknown; additionalProperty?: unknown };
    };
    const keyword = typeof issue.keyword === 'string' ? issue.keyword : 'invalid';
    const path = typeof issue.instancePath === 'string'
      ? issue.instancePath.replace(/^\//, '').replaceAll('/', '.')
      : '';
    const property = keyword === 'required' && typeof issue.params?.missingProperty === 'string'
      ? issue.params.missingProperty
      : keyword === 'additionalProperties' && typeof issue.params?.additionalProperty === 'string'
        ? issue.params.additionalProperty
        : null;
    const field = [path, property].filter(Boolean).join('.') || 'request';
    return [{ field, keyword, reason: validationReason(keyword) }];
  });
}

function validationReason(keyword: string): string {
  if (keyword === 'required') return 'is required';
  if (keyword === 'enum' || keyword === 'const') return 'has an unsupported value';
  if (keyword === 'type') return 'has the wrong data type';
  if (keyword === 'minimum' || keyword === 'minLength') return 'is below the allowed minimum';
  if (keyword === 'maximum' || keyword === 'maxLength' || keyword === 'maxItems') {
    return 'exceeds the allowed limit';
  }
  if (keyword === 'additionalProperties') return 'is not supported';
  return 'is not valid';
}

function humanizeField(field: string): string {
  const last = field.split('.').at(-1) ?? 'request';
  return last.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (character) => character.toUpperCase());
}
