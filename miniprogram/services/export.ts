/**
 * services/export.ts
 * 相册导出（PDF 合成）
 */
import { callFunction } from '../utils/request';

/** 云函数合成 PDF：传入页图 fileID 列表，返回 PDF 的云存储 fileID */
export function createPdf(
  albumId: string,
  pageFileIds: string[]
): Promise<{ pdf_file_id: string; page_count: number }> {
  return callFunction('export', 'createPdf', {
    album_id: albumId,
    page_file_ids: pageFileIds,
  });
}
