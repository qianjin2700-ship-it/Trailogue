import type {
  ActualStoryLanguage,
  BookStyle,
  GenerationLanguage,
  PhotoStatus,
  StoryVersionType,
  TripStatus,
} from '@trailogue/domain';

export interface CreativeRequirementsDTO {
  mainPerson: string | null;
  companions: string | null;
  relationship: string | null;
  focusPerson: string | null;
  writingStyle: 'warm_documentary' | 'literary' | 'playful' | 'parent_child' | 'travel_guide' | 'custom';
  customWritingStyle: string | null;
  contentLength: 'short' | 'standard' | 'detailed' | 'custom';
  customWordCount: number | null;
  focuses: Array<'scenery' | 'food' | 'people' | 'journey' | 'reflection' | 'culture'>;
  specialMemories: string | null;
  emphasis: string | null;
  avoidExpressions: string | null;
  otherRequirements: string | null;
  generationLanguage: GenerationLanguage;
  bookStyle: BookStyle;
}

export function defaultCreativeRequirements(): CreativeRequirementsDTO {
  return {
    mainPerson: null,
    companions: null,
    relationship: null,
    focusPerson: null,
    writingStyle: 'warm_documentary',
    customWritingStyle: null,
    contentLength: 'standard',
    customWordCount: null,
    focuses: ['journey', 'people'],
    specialMemories: null,
    emphasis: null,
    avoidExpressions: null,
    otherRequirements: null,
    generationLanguage: 'auto',
    bookStyle: 'travel_magazine',
  };
}

export function normalizeCreativeRequirements(value: unknown): CreativeRequirementsDTO {
  const defaults = defaultCreativeRequirements();
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const text = (key: string, maxLength: number): string | null =>
    typeof input[key] === 'string' && input[key].trim()
      ? input[key].trim().slice(0, maxLength)
      : null;
  const writingStyles = ['warm_documentary', 'literary', 'playful', 'parent_child', 'travel_guide', 'custom'] as const;
  const contentLengths = ['short', 'standard', 'detailed', 'custom'] as const;
  const focusValues = ['scenery', 'food', 'people', 'journey', 'reflection', 'culture'] as const;
  const languages = ['auto', 'zh-Hans', 'zh-Hant', 'en', 'ja', 'ko'] as const;
  const bookStyles = ['travel_magazine', 'warm_memoir', 'minimalist'] as const;
  const oneOf = <T extends string>(candidate: unknown, allowed: readonly T[], fallback: T): T =>
    typeof candidate === 'string' && allowed.includes(candidate as T) ? candidate as T : fallback;
  const rawLength = input.contentLength === 'medium'
    ? 'standard'
    : input.contentLength === 'long' ? 'detailed' : input.contentLength;
  const focuses = Array.isArray(input.focuses)
    ? [...new Set(input.focuses.filter((item): item is typeof focusValues[number] =>
      typeof item === 'string' && focusValues.includes(item as typeof focusValues[number])))].slice(0, 6)
    : defaults.focuses;
  const customWordCount = typeof input.customWordCount === 'number'
    && Number.isInteger(input.customWordCount)
    && input.customWordCount >= 200
    && input.customWordCount <= 10_000
    ? input.customWordCount
    : null;

  return {
    mainPerson: text('mainPerson', 500),
    companions: text('companions', 1_000),
    relationship: text('relationship', 500),
    focusPerson: text('focusPerson', 500),
    writingStyle: oneOf(input.writingStyle, writingStyles, defaults.writingStyle),
    customWritingStyle: text('customWritingStyle', 1_000),
    contentLength: oneOf(rawLength, contentLengths, defaults.contentLength),
    customWordCount,
    focuses,
    specialMemories: text('specialMemories', 10_000),
    emphasis: text('emphasis', 5_000),
    avoidExpressions: text('avoidExpressions', 2_000),
    otherRequirements: text('otherRequirements', 5_000),
    generationLanguage: oneOf(input.generationLanguage, languages, defaults.generationLanguage),
    bookStyle: oneOf(input.bookStyle, bookStyles, defaults.bookStyle),
  };
}

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PHOTOS_UPLOADING'
  | 'RATE_LIMITED'
  | 'INVALID_APPLE_TOKEN'
  | 'NOT_IMPLEMENTED'
  | 'AI_SERVICE_ERROR'
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
    details?: {
      issues?: Array<{ field: string; reason: string }>;
    };
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
  coverPhotoUrl?: string | null;
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
  creativeRequirements?: CreativeRequirementsDTO;
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
  creativeRequirements?: CreativeRequirementsDTO;
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
  languageMode?: GenerationLanguage;
  actualLanguage?: ActualStoryLanguage;
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
  versionType: StoryVersionType;
  languageMode: GenerationLanguage;
  actualLanguage: ActualStoryLanguage;
  creativeSnapshot: CreativeRequirementsDTO;
  content: StoryContentDTO;
  createdAt: string;
  updatedAt: string;
}

export interface GenerateStoryRequest {
  feedback?: string | null;
  confirmed: true;
  fallbackLanguage?: ActualStoryLanguage;
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
  tripTitle: string;
  startDate: string | null;
  bookStyle: BookStyle;
  layout: Record<string, unknown>;
  story: StoryContentDTO;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateBookLayoutRequest {
  layout: Record<string, unknown>;
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
