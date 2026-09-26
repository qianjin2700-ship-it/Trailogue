/**
 * services/privacy.ts
 * 数据删除管理
 */
import { callFunction } from '../utils/request';
import { DeleteAllUserDataResult } from '../types';

/** 删除全部用户数据 */
export function deleteAllUserData(confirmText: string): Promise<DeleteAllUserDataResult> {
  return callFunction<DeleteAllUserDataResult>('privacy', 'deleteAllUserData', {
    confirm_text: confirmText,
  });
}
