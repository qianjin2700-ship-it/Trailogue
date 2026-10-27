import type { PhotoStatus, TripStatus } from '@trailogue/domain';

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

export interface CreateTripRequest {
  title: string;
  destinationName: string;
  description?: string | null;
  startDate: string;
  endDate: string;
}

export type PhotoMimeType = 'image/jpeg' | 'image/png';

export interface CreatePhotoUploadRequest {
  clientUploadId: string;
  originalFilename: string;
  mimeType: PhotoMimeType;
  fileSize: number;
  width: number;
  height: number;
}

export interface PhotoUploadIntentDTO {
  photoId: string;
  uploadUrl: string;
  method: 'PUT';
  headers: { 'Content-Type': PhotoMimeType };
  expiresAt: string;
  maxBytes: number;
  allowedMimeTypes: PhotoMimeType[];
}

export interface PhotoDTO {
  id: string;
  tripId: string;
  status: PhotoStatus;
  url: string;
  originalFilename: string;
  mimeType: PhotoMimeType;
  fileSize: number;
  width: number | null;
  height: number | null;
  capturedAt: string | null;
  createdAt: string;
  uploadedAt: string | null;
}

export type TripDTO = TripSummaryDTO;

export type TripListResponse = ApiListResponse<TripSummaryDTO>;
export type TripDetailResponse = ApiDataResponse<TripDTO>;
export type CreateTripResponse = ApiDataResponse<TripDTO>;
export type CreatePhotoUploadResponse = ApiDataResponse<PhotoUploadIntentDTO>;
export type CompletePhotoUploadResponse = ApiDataResponse<PhotoDTO>;
export type PhotoListResponse = ApiDataResponse<PhotoDTO[]>;
