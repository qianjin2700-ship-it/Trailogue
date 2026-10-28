import type { UserDTO } from '@/contracts/user';

export interface User {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  email: string | null;
  privacyAgreedAt: Date | null;
  retentionDays: number;
  createdAt: Date;
  updatedAt: Date;
}

export function mapUserDTO(dto: UserDTO): User {
  return {
    id: dto.id,
    name: dto.displayName,
    avatarUrl: dto.avatarUrl,
    email: dto.email,
    privacyAgreedAt: dto.privacyAgreedAt ? new Date(dto.privacyAgreedAt) : null,
    retentionDays: dto.retentionDays,
    createdAt: new Date(dto.createdAt),
    updatedAt: new Date(dto.updatedAt),
  };
}

