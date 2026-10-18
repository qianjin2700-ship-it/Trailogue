import type { TripStatus } from '@trailogue/domain';

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INVALID_APPLE_TOKEN'
  | 'NOT_IMPLEMENTED'
  | 'INTERNAL_ERROR';

export interface ApiDataResponse<T> {
  data: T;
}

export interface ApiListResponse<T> {
  data: T[];
  meta: {
    nextCursor: string | null;
  };
}

export interface ApiErrorResponse {
  error: {
    code: ApiErrorCode;
    message: string;
    requestId: string;
  };
}

export interface AppleSignInRequest {
  identityToken: string;
  authorizationCode: string | null;
  nonce: string;
  profile: {
    givenName: string | null;
    familyName: string | null;
    email: string | null;
  };
}

export interface AuthSessionDTO {
  accessToken: string;
  expiresAt: string;
  user: UserDTO;
}

export interface UserDTO {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  email: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TripSummaryDTO {
  id: string;
  title: string;
  description: string | null;
  destinationName: string | null;
  status: TripStatus;
  coverPhotoId: string | null;
  photoCount: number;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TripDTO = TripSummaryDTO;

export type TripListResponse = ApiListResponse<TripSummaryDTO>;
export type TripDetailResponse = ApiDataResponse<TripDTO>;
