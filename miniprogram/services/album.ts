/**
 * services/album.ts
 * 相册 CRUD
 */
import { callFunction } from '../utils/request';
import {
  Album,
  AlbumListItem,
  CreateAlbumParams,
  CreateAlbumResult,
  GetAlbumResult,
} from '../types';

/** 创建相册 */
export function createAlbum(params: CreateAlbumParams): Promise<CreateAlbumResult> {
  return callFunction<CreateAlbumResult>('album', 'createAlbum', params as unknown as Record<string, unknown>);
}

/** 更新相册 */
export function updateAlbum(
  albumId: string,
  params: Partial<CreateAlbumParams>
): Promise<{ ok: boolean }> {
  return callFunction('album', 'updateAlbum', { album_id: albumId, ...params });
}

/** 相册列表 */
export function listAlbums(
  cursor?: string,
  limit = 20
): Promise<{ items: AlbumListItem[]; next_cursor: string | null }> {
  return callFunction('album', 'listAlbums', { cursor: cursor || null, limit });
}

/** 获取相册详情 */
export function getAlbum(albumId: string): Promise<GetAlbumResult> {
  return callFunction<GetAlbumResult>('album', 'getAlbum', { album_id: albumId });
}

/** 删除相册 */
export function deleteAlbum(albumId: string): Promise<{ ok: boolean }> {
  return callFunction('album', 'deleteAlbum', { album_id: albumId });
}
