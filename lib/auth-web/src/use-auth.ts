import { useCallback, useEffect, useState } from 'react';
import type { AuthUser } from '@workspace/api-client-react';

export type { AuthUser };

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isLoggingIn: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

const DEFAULT_USER: AuthUser = {
  id: 'default-owner',
  email: 'oficina@local',
  firstName: 'Oficina',
  lastName: '3D',
  profileImageUrl: null,
};

export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(DEFAULT_USER);

  useEffect(() => {
    fetch('/api/auth/user', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) {
          setUser(data.user);
        }
      })
      .catch(() => {});
  }, []);

  const login = useCallback(async () => {}, []);
  const logout = useCallback(() => {}, []);
  const clearError = useCallback(() => {}, []);

  return {
    user,
    isLoading: false,
    isAuthenticated: true,
    isLoggingIn: false,
    error: null,
    login,
    logout,
    clearError,
  };
}
