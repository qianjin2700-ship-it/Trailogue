import type { UserDTO } from '@/contracts/user';

export interface User {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  email: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function mapUserDTO(dto: UserDTO): User {
  return {
    id: dto.id,
    name: dto.displayName,
    avatarUrl: dto.avatarUrl,
    email: dto.email,
    createdAt: new Date(dto.createdAt),
    updatedAt: new Date(dto.updatedAt),
  };
}

