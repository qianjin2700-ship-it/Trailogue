/** Existing CloudBase `users` document shape. */
export interface UserDTO {
  _id: string;
  _openid: string;
  nickname: string | null;
  avatar_url: string | null;
  privacy_agreed_at: string | null;
  retention_days: number;
  created_at: string;
  updated_at: string;
}

