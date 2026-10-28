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
  privacyAgreedAt: string | null;
  retentionDays: number;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateUserSettingsRequest {
  displayName?: string | null;
  retentionDays?: number;
  privacyAgreed?: boolean;
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
  storyBackground: string | null;
  peopleNotes: string | null;
  highlights: string | null;
  writingStyle: string;
  customWritingStyle: string | null;
  avoidExpressions: string | null;
  contentLength: string;
  arrangement: string;
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

export interface UpdateTripRequest {
  title?: string;
  destinationName?: string;
  description?: string | null;
  startDate?: string;
  endDate?: string;
  storyBackground?: string | null;
  peopleNotes?: string | null;
  highlights?: string | null;
  writingStyle?: string;
  customWritingStyle?: string | null;
  avoidExpressions?: string | null;
  contentLength?: string;
  arrangement?: string;
}

export interface ReorderPhotosRequest {
  photoIds: string[];
}

export interface SetTripCoverRequest {
  photoId: string | null;
}

export interface DeletionResultDTO {
  deleted: true;
}

export interface StoryChapterDTO {
  chapterId: string;
  title: string;
  dateLabel: string | null;
  locationLabel: string | null;
  narrative: string;
  photoIds: string[];
  captions: Record<string, string>;
  locked: boolean;
  userEdited: boolean;
}

export interface StoryMetaDTO {
  model: string;
  generatedAt: string;
  degraded: boolean;
  visionAvailable: boolean;
  uncertainNotes: string[];
  totalTokens: number;
  callCount: number;
}

export interface StoryContentDTO {
  title: string;
  subtitle: string;
  preface: string;
  chapters: StoryChapterDTO[];
  epilogue: string;
  shareSummary: string | null;
  meta: StoryMetaDTO;
}

export interface StoryDTO {
  id: string;
  tripId: string;
  version: number;
  source: 'user' | 'ai' | 'mixed';
  degraded: boolean;
  content: StoryContentDTO;
  createdAt: string;
  updatedAt: string;
}

export interface GenerateStoryRequest {
  feedback?: string | null;
}

export interface UpdateStoryRequest {
  content: StoryContentDTO;
}

export interface BookPreviewDTO {
  id: string;
  tripId: string;
  storyId: string;
  title: string;
  subtitle: string | null;
  coverPhotoId: string | null;
  status: 'draft' | 'generating' | 'ready' | 'failed';
  story: StoryContentDTO;
  createdAt: string;
  updatedAt: string;
}

export interface ShareLinkDTO {
  id: string;
  url: string;
  expiresAt: string | null;
}

export interface SharedStoryDTO {
  tripTitle: string;
  story: StoryContentDTO;
  photos: Array<{ id: string; url: string }>;
}

export type PhotoMimeType = 'image/jpeg' | 'image/png';

export interface CreatePhotoUploadRequest {
  clientUploadId: string;
  originalFilename: string;
  mimeType: PhotoMimeType;
  fileSize: number;
  width: number;
  height: number;
  capturedAt?: string | null;
}

export interface UpdatePhotoRequest {
  caption?: string | null;
  locationName?: string | null;
  capturedAt?: string | null;
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
  caption: string | null;
  locationName: string | null;
}

export type TripDTO = TripSummaryDTO;

export type TripListResponse = ApiListResponse<TripSummaryDTO>;
export type TripDetailResponse = ApiDataResponse<TripDTO>;
export type CreateTripResponse = ApiDataResponse<TripDTO>;
export type CreatePhotoUploadResponse = ApiDataResponse<PhotoUploadIntentDTO>;
export type CompletePhotoUploadResponse = ApiDataResponse<PhotoDTO>;
export type PhotoListResponse = ApiDataResponse<PhotoDTO[]>;
