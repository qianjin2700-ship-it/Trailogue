import * as SecureStore from 'expo-secure-store';

const AUTH_TOKEN_KEY = 'trailogue.session-token';

export interface AuthStorage {
  saveToken(token: string): Promise<void>;
  getToken(): Promise<string | null>;
  removeToken(): Promise<void>;
}

export const authStorage: AuthStorage = {
  saveToken(token) {
    return SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
  },
  getToken() {
    return SecureStore.getItemAsync(AUTH_TOKEN_KEY);
  },
  removeToken() {
    return SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
  },
};

