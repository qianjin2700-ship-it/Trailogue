import type { AppleSignInRequest, AuthSessionDTO, UserDTO } from '@trailogue/contracts';
import type { FastifyInstance } from 'fastify';

import { HttpError } from '../errors/httpError.js';
import {
  InvalidAppleIdentityError,
} from '../modules/auth/appleIdentityVerifier.js';
import type { AuthenticationService } from '../modules/auth/authService.js';

export async function registerAuthRoutes(
  app: FastifyInstance,
  authentication: AuthenticationService,
) {
  app.post(
    '/v1/auth/apple',
    {
      schema: {
        tags: ['auth'],
        description: 'Verify an Apple identity token and create a Trailogue bearer session.',
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['identityToken', 'nonce', 'profile'],
          properties: {
            identityToken: { type: 'string', minLength: 1, maxLength: 16_384 },
            authorizationCode: { type: ['string', 'null'], maxLength: 4_096 },
            nonce: { type: 'string', minLength: 16, maxLength: 256 },
            profile: {
              type: 'object',
              additionalProperties: false,
              required: ['givenName', 'familyName', 'email'],
              properties: {
                givenName: { type: ['string', 'null'], maxLength: 160 },
                familyName: { type: ['string', 'null'], maxLength: 160 },
                email: { type: ['string', 'null'], maxLength: 320 },
              },
            },
          },
        },
      },
    },
    async (request) => {
      try {
        const result = await authentication.signInWithApple(request.body as AppleSignInRequest);
        const data: AuthSessionDTO = {
          accessToken: result.accessToken,
          expiresAt: result.expiresAt.toISOString(),
          user: toUserDto(result.user),
        };
        return { data };
      } catch (error) {
        if (error instanceof InvalidAppleIdentityError) {
          throw new HttpError(401, 'INVALID_APPLE_TOKEN', 'Apple identity token is invalid');
        }
        throw error;
      }
    },
  );
}

export function toUserDto(user: {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  email: string | null;
  createdAt: Date;
  updatedAt: Date;
}): UserDTO {
  return {
    id: user.id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
