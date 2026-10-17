import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { AppError } from '@/api/errors';
import { restoreSession, type AuthStatus } from '@/auth/restoreSession';
import { authApi, usersApi } from '@/composition/services';
import { mapUserDTO, type User } from '@/domain/user/user';
import { AppleSignInCancelledError, getAppleCredential } from '@/services/appleAuth';
import { authStorage } from '@/services/authStorage';

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  error: AppError | null;
  isSigningIn: boolean;
  retryRestore(): Promise<void>;
  signInWithApple(): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('unknown');
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  const retryRestore = useCallback(async () => {
    setStatus('unknown');
    setError(null);
    const restored = await restoreSession(authStorage, usersApi);
    setStatus(restored.status);
    setUser(restored.user);
    setError(restored.error);
  }, []);

  useEffect(() => {
    let active = true;
    void restoreSession(authStorage, usersApi).then((restored) => {
      if (!active) return;
      setStatus(restored.status);
      setUser(restored.user);
      setError(restored.error);
    });
    return () => {
      active = false;
    };
  }, []);

  const signInWithApple = useCallback(async () => {
    setIsSigningIn(true);
    setError(null);
    try {
      const credential = await getAppleCredential();
      const session = await authApi.signInWithApple(credential);
      await authStorage.saveToken(session.accessToken);
      setUser(mapUserDTO(session.user));
      setStatus('authenticated');
    } catch (signInError) {
      if (!(signInError instanceof AppleSignInCancelledError)) {
        setError(
          signInError instanceof AppError
            ? signInError
            : new AppError('UNKNOWN', undefined, signInError)
        );
      }
    } finally {
      setIsSigningIn(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    await authStorage.removeToken();
    setUser(null);
    setError(null);
    setStatus('unauthenticated');
  }, []);

  const value = useMemo(
    () => ({ status, user, error, isSigningIn, retryRestore, signInWithApple, signOut }),
    [status, user, error, isSigningIn, retryRestore, signInWithApple, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

