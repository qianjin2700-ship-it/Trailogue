/**
 * services/photo.ts
 * 照片上传/元数据/排序/删除
 */
import { callFunction } from '../utils/request';
import {
  Photo,
  CommitUploadParams,
  CommitUploadResult,
  UpdatePhotoMetaParams,
} from '../types';

/** 提交上传（每张上传完成后调用） */
export function commitUpload(params: CommitUploadParams): Promise<CommitUploadResult> {
  return callFunction<CommitUploadResult>('photo', 'commitUpload', params as unknown as Record<string, unknown>);
}

/** 请求元数据处理 */
export function requestMetaProcess(albumId: string): Promise<{
  job_id: string;
  status: string;
  batches: { total: number; done: number; failed: number };
}> {
  return callFunction('photo', 'requestMetaProcess', { album_id: albumId });
}

/** 查询元数据处理任务进度（photo-review 轮询用） */
export function getMetaJobStatus(jobId: string): Promise<{
  job_id: string;
  status: string;
  progress: number;
  batches: { total: number; done: number; failed: number };
}> {
  return callFunction('photo', 'getMetaJobStatus', { job_id: jobId });
}

/** 获取照片列表 */
export function listPhotos(albumId: string, groupId?: string): Promise<{ photos: Photo[] }> {
  return callFunction('photo', 'listPhotos', { album_id: albumId, group_id: groupId || null });
}

/** 更新照片元数据（用户补充/修改） */
export function updatePhotoMeta(params: UpdatePhotoMetaParams): Promise<{ ok: boolean }> {
  return callFunction('photo', 'updatePhotoMeta', params as unknown as Record<string, unknown>);
}

/** 确认元数据（批量确认 → 生成事实库快照） */
export function confirmMeta(albumId: string): Promise<{
  fact_base_id: string;
  meta_summary: { high: number; low: number; unknown: number };
}> {
  return callFunction('photo', 'confirmMeta', { album_id: albumId });
}

/** 重排照片 */
export function reorderPhotos(photoIds: string[]): Promise<{ ok: boolean }> {
  return callFunction('photo', 'reorderPhotos', { photo_ids: photoIds });
}

/** 删除照片 */
export function deletePhoto(photoId: string): Promise<{ ok: boolean }> {
  return callFunction('photo', 'deletePhoto', { photo_id: photoId });
}

/** 按照片ID批量获取云存储 fileID（故事页渲染图片用） */
export function getPhotoFiles(
  photoIds: string[]
): Promise<{ files: Record<string, { file_id: string | null; thumb_file_id: string | null }> }> {
  return callFunction('photo', 'getPhotoFiles', { photo_ids: photoIds });
}
