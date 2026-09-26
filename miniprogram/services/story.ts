/**
 * services/story.ts
 * 故事生成/查询/编辑/重生成
 */
import { callFunction } from '../utils/request';
import {
  GetStoryResult,
  RegenerateSectionParams,
  UpdateStoryParams,
  JobStatusResponse,
} from '../types';

/** 生成故事 */
export function generateStory(albumId: string): Promise<{ job_id: string }> {
  return callFunction('story', 'generateStory', { album_id: albumId });
}

/** 轮询任务状态 */
export function getJobStatus(jobId: string): Promise<JobStatusResponse> {
  return callFunction<JobStatusResponse>('story', 'getJobStatus', { job_id: jobId });
}

/** 单段重生成 */
export function regenerateSection(params: RegenerateSectionParams): Promise<{
  job_id: string;
  chapter_id: string;
}> {
  return callFunction('story', 'regenerateSection', params as unknown as Record<string, unknown>);
}

/** 获取故事 */
export function getStory(albumId: string, version?: number): Promise<GetStoryResult> {
  return callFunction<GetStoryResult>('story', 'getStory', {
    album_id: albumId,
    version: version || null,
  });
}

/** 更新故事（编辑保存） */
export function updateStory(params: UpdateStoryParams): Promise<{ version: number }> {
  return callFunction('story', 'updateStory', params as unknown as Record<string, unknown>);
}
