import type { UserDTO } from './user';

/** Proposed mobile HTTPS boundary; no matching production endpoint exists yet. */
export interface AppleSignInRequestDTO {
  identity_token: string;
  authorization_code: string | null;
  nonce: string;
  user: {
    given_name: string | null;
    family_name: string | null;
    email: string | null;
  };
}

/** Proposed mobile session response; the server must issue this after Apple verification. */
export interface AuthSessionDTO {
  access_token: string;
  user: UserDTO;
}

