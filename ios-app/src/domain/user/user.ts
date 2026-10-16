import type { UserDTO } from '@/contracts/user';

export interface User {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  privacyAgreedAt: Date | null;
  retentionDays: number;
  createdAt: Date;
  updatedAt: Date;
}

export function mapUserDTO(dto: UserDTO): User {
  return {
    id: dto._id,
    name: dto.nickname,
    avatarUrl: dto.avatar_url,
    privacyAgreedAt: dto.privacy_agreed_at ? new Date(dto.privacy_agreed_at) : null,
    retentionDays: dto.retention_days,
    createdAt: new Date(dto.created_at),
    updatedAt: new Date(dto.updated_at),
  };
}

