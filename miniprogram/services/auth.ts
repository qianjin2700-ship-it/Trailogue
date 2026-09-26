/**
 * services/auth.ts
 * 登录/资料/隐私同意
 */
import { callFunction } from '../utils/request';
import { LoginResult } from '../types';

/** 登录 */
export function login(): Promise<LoginResult> {
  return callFunction<LoginResult>('auth', 'login');
}

/** 更新用户资料 */
export function updateProfile(nickname: string): Promise<{ ok: boolean }> {
  return callFunction('auth', 'updateProfile', { nickname });
}

/** 同意隐私政策 */
export function agreePrivacy(retentionDays: number): Promise<{ ok: boolean }> {
  return callFunction('auth', 'agreePrivacy', { retention_days: retentionDays });
}
