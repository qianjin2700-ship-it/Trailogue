/**
 * types/index.ts
 * 旅迹成书 — 前后端共享类型定义
 * 对齐 04-database-models / 05-api-contracts / 06-ai-schemas
 */

// ============================================================
// 0. 通用
// ============================================================

/** 统一响应包裹 */
export interface ApiEnvelope<T = unknown> {
  code: number;
  data?: T;
  message?: string;
}

/** 错误码 */
export enum ErrorCode {
  OK = 0,
  PARAM_INVALID = 40001,
  UNAUTHORIZED = 40101,
  FORBIDDEN = 40301,
  NOT_FOUND = 40401,
  STATUS_CONFLICT = 40901,
  PHOTO_LIMIT_50 = 40902,
  PHOTO_NOT_READY = 40903,
  FILE_INVALID = 40904,
  RATE_LIMITED = 42901,
  INTERNAL_ERROR = 50001,
  THIRD_PARTY_ERROR = 50002,
  TASK_TIMEOUT = 50003,
}

// ============================================================
// 1. 用户 (users)
// ============================================================

export interface User {
  _id: string;
  _openid: string;
  nickname: string | null;
  avatar_url: string | null;
  privacy_agreed_at: string | null;
  retention_days: number; // 90 | -1(永久)
  created_at: string;
  updated_at: string;
}

// ============================================================
// 2. 相册 (albums)
// ============================================================

export type AlbumStatus = 'draft' | 'reviewing' | 'generating' | 'done' | 'failed';

export type AlbumStyle =
  | 'warm_documentary'
  | 'casual_humor'
  | 'literary'
  | 'family'
  | 'youth'
  | 'concise'
  | 'custom';

/** 文字篇幅：short 简短 / medium 适中 / long 详细 */
export type AlbumContentLength = 'short' | 'medium' | 'long';

/** 照片编排策略：timeline 时间线 / location 地点聚类 / event 事件流 */
export type AlbumArrangement = 'timeline' | 'location' | 'event';

export interface Album {
  _id: string;
  _openid: string;
  name: string; // ≤20
  theme: string;
  background: string; // ≤200
  relations: string; // ≤50
  highlights: string; // ≤100
  style: AlbumStyle;
  style_custom: string | null;
  avoid_expressions: string | null; // ≤100
  content_length: AlbumContentLength;
  arrangement: AlbumArrangement;
  status: AlbumStatus;
  photo_count: number;
  fact_base_snapshot_id: string | null;
  story_id: string | null;
  cover_file_id: string | null;
  created_at: string;
  updated_at: string;
  deleted: boolean;
}

/** 相册列表项（首页卡片用） */
export interface AlbumListItem {
  album_id: string;
  name: string;
  status: AlbumStatus;
  photo_count: number;
  cover_thumb_url: string;
  updated_at: string;
}

// ============================================================
// 3. 照片 (photos)
// ============================================================

export type UploadStatus = 'pending' | 'uploading' | 'uploaded' | 'failed' | 'checking' | 'duplicate';

export type FileFormat = 'jpeg' | 'png' | 'heic';

export type MetaSource = 'exif' | 'file_meta' | 'inferred' | 'user' | 'unknown';

export type LocationSource = 'exif' | 'inferred' | 'user' | 'unknown';

export type VisionStatus = 'pending' | 'done' | 'failed';

export interface PhotoLocation {
  lat: number | null;
  lng: number | null;
  city: string | null;
  district: string | null;
  poi: string | null;
  source: LocationSource;
  confidence: number; // 0~1
}

export interface VisionFact {
  type:
    | 'scene'
    | 'landmark'
    | 'weather'
    | 'time_of_day'
    | 'season'
    | 'activity'
    | 'text_visible'
    | 'object'
    | 'food'
    | 'person_group';
  value: string; // ≤30 字
  confidence: number; // 0~1
  source: 'vision' | 'user';
  related_photo_ids: string[];
  inference_basis: string | null;
}

export interface PhotoVision {
  facts: VisionFact[];
  status: VisionStatus;
  error: string | null;
}

export interface Photo {
  _id: string;
  _openid: string;
  album_id: string;
  file_id: string;
  thumb_file_id: string;
  upload_status: UploadStatus;
  file_size: number;
  file_format: FileFormat;
  file_hash: string;
  is_duplicate: boolean;
  duplicate_of: string | null;
  fail_reason: string | null;

  // 元数据（三级降级）
  taken_at: string | null;
  taken_at_source: MetaSource;
  taken_at_confidence: number; // 0~1

  location: PhotoLocation | null;
  orientation: number | null;
  raw_exif: Record<string, unknown>;

  // 视觉理解
  vision: PhotoVision;

  group_id: string | null;
  sort_index: number;
  user_confirmed: boolean;
  created_at: string;
  deleted: boolean;
}

// ============================================================
// 4. 照片分组 (photo_groups)
// ============================================================

export interface PhotoGroup {
  _id: string;
  _openid: string;
  album_id: string;
  title: string;
  time_start: string | null;
  time_end: string | null;
  location_label: string;
  photo_ids: string[];
  sort_index: number;
  created_at: string;
}

// ============================================================
// 5. 事实库 + 故事 (album_stories)
// ============================================================

export type AlbumStoryKind = 'fact_base' | 'story';

export interface PhotoFact {
  photo_id: string;
  taken_at: string | null;
  taken_at_source: MetaSource;
  taken_at_confidence: number;
  taken_at_user_confirmed: boolean;
  location: {
    lat: number | null;
    lng: number | null;
    city: string | null;
    district: string | null;
    poi: string | null;
    source: LocationSource;
    confidence: number;
    user_confirmed: boolean;
    original_value: string | null;
  };
  facts: VisionFact[];
  can_use_in_story: boolean;
}

export interface FactBase {
  photos: PhotoFact[];
  user_inputs: {
    background: string;
    relations: string;
    highlights: string;
    style: string;
  };
  unknown_items: number;
}

export interface Chapter {
  chapter_id: string;
  title: string; // ≤16
  date_label: string | null;
  location_label: string | null;
  narrative: string; // 100~400 字
  photo_ids: string[];
  captions: Record<string, string>;
  locked: boolean;
  user_edited: boolean;
}

export interface StoryMeta {
  model: string;
  generated_at: string;
  degraded: boolean;
  uncertain_notes: string[];
  total_tokens: number;
  call_count: number;
  error_codes: string[];
}

export interface StoryOutput {
  title: string; // ≤20
  subtitle: string; // ≤30
  preface: string; // 80~200 字
  chapters: Chapter[];
  epilogue: string; // 60~200 字
  share_summary: string | null; // ≤100
  meta: StoryMeta;
}

export interface AlbumStory {
  _id: string;
  _openid: string;
  album_id: string;
  kind: AlbumStoryKind;
  version: number;
  fact_base?: FactBase;
  story?: StoryOutput;
  locked_chapters?: string[];
  share_summary?: string | null;
  generate_meta?: {
    model: string;
    generated_at: string;
    degraded: boolean;
    total_tokens: number;
    total_cost_estimate: number;
  };
  created_at: string;
}

// ============================================================
// 6. 异步任务 (ai_jobs)
// ============================================================

export type JobType = 'meta' | 'vision' | 'story' | 'regen_section' | 'render';

export type JobStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export type JobStage =
  | 'exif'
  | 'vision'
  | 'cluster'
  | 'factbase'
  | 'chapter_N'
  | 'summary';

export interface JobBatch {
  batch_no: number;
  photo_ids: string[];
  stage: string;
  status: JobStatus;
  attempts: number;
  updated_at: string;
}

export interface AiJob {
  _id: string;
  _openid: string;
  album_id: string;
  type: JobType;
  status: JobStatus;
  stage: JobStage;
  progress: number; // 0~1
  batches: JobBatch[];
  failed_photo_ids: string[];
  payload: Record<string, unknown>;
  result_ref: string | null;
  error: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
}

/** getJobStatus 返回结构 */
export interface JobStatusResponse {
  status: JobStatus;
  stage: string;
  progress: number;
  batches: { total: number; done: number; failed: number };
  failed_photo_ids: string[];
  stage_message: string;
  estimated_remaining: number; // 秒
  result_ref: string | null;
  error: string | null;
}

// ============================================================
// 7. 分享链接 (share_links)
// ============================================================

export interface ShareLink {
  _id: string;
  _openid: string;
  album_id: string;
  story_id: string;
  token: string;
  expire_at: string | null; // null=永久
  revoked: boolean;
  visit_count: number;
  created_at: string;
}

// ============================================================
// 8. API 入参/出参类型
// ============================================================

// --- auth ---
export interface LoginResult {
  openid: string;
  user: Pick<User, 'nickname' | 'retention_days' | 'privacy_agreed_at'>;
  need_privacy_agree: boolean;
}

// --- album ---
export interface CreateAlbumParams {
  name: string;
  theme: string;
  background: string;
  relations: string;
  highlights: string;
  avoid_expressions: string | null;
  style: AlbumStyle;
  style_custom: string | null;
  content_length: AlbumContentLength;
  arrangement: AlbumArrangement;
}

export interface CreateAlbumResult {
  album_id: string;
  status: AlbumStatus;
}

export interface GetAlbumResult {
  album: Album;
  groups: Pick<PhotoGroup, '_id' | 'title' | 'photo_ids' | 'location_label'>[];
  meta_summary: { high: number; low: number; unknown: number };
  active_job: { job_id: string; type: JobType; progress: number } | null;
}

// --- photo ---
export interface CommitUploadParams {
  album_id: string;
  file_id: string;
  thumb_file_id: string;
  file_size: number;
  file_format: FileFormat;
  file_hash: string;
  client_hint: { taken_at: string | null };
}

export interface CommitUploadResult {
  photo_id: string;
  upload_status: UploadStatus;
  photo_count: number;
  is_duplicate?: boolean;
  duplicate_of?: string | null;
}

export interface UpdatePhotoMetaParams {
  photo_id: string;
  taken_at?: string | null;
  location?: Partial<PhotoLocation> | null;
  mark_unknown?: string[];
}

// --- story ---
export interface RegenerateSectionParams {
  album_id: string;
  chapter_id: string;
  feedback?: string;
}

export interface GetStoryResult {
  story: StoryOutput;
  version: number;
  degraded: boolean;
}

export interface UpdateStoryParams {
  album_id: string;
  patch: {
    title?: string;
    chapters?: Array<{
      chapter_id: string;
      title?: string;
      narrative?: string;
      captions?: Record<string, string>;
    }>;
  };
}

// --- share ---
export interface CreateShareParams {
  album_id: string;
  expire_days: number; // 7 | 30 | -1
}

export interface CreateShareResult {
  share_id: string;
  token: string;
  path: string;
}

export interface GetSharedStoryResult {
  story: StoryOutput;
  album_name: string;
  expire_at: string | null;
}

export interface GetShareQrCodeResult {
  qrcode_base64: string;
}

// --- export（相册导出） ---
export interface CreatePdfResult {
  pdf_file_id: string;
  page_count: number;
}

// --- privacy ---
export interface DeleteAllUserDataResult {
  deleted: {
    albums: number;
    photos: number;
    stories: number;
    files: number;
  };
}

// ============================================================
// 9. 组件 Props 类型
// ============================================================

export type MetaSourceBadge = 'exif' | 'inferred' | 'user' | 'unknown';

export interface MetaBadgeProps {
  source: MetaSourceBadge;
  confidence?: number;
}

export interface PhotoCardProps {
  photo: Photo;
  showMeta: boolean;
  editable: boolean;
}

export interface UploadItemProps {
  photo: Photo;
  progress: number;
  status: UploadStatus;
  failReason: string | null;
}

export interface ChapterCardProps {
  chapter: Chapter;
  mode: 'read' | 'edit';
  locked: boolean;
}
