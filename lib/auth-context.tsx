import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getApiUrl } from './query-client';

export interface AuthUser {
  id: string;
  email: string;
  username: string | null;
  avatarUrl: string | null;
  bio: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  needsProfileSetup: boolean;
  signup: (email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: AuthUser) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const AUTH_TOKEN_KEY = 'solo_auth_session';

async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = new URL(path, baseUrl).toString();

  const sessionCookie = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };
  if (sessionCookie) {
    headers['Cookie'] = sessionCookie;
  }

  const fetchFn = Platform.OS === 'web' ? globalThis.fetch : (await import('expo/fetch')).fetch;
  return fetchFn(url, {
    ...options,
    headers,
    credentials: 'include' as RequestCredentials,
  } as any);
}

async function saveCookies(response: Response) {
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) {
    const match = setCookie.match(/connect\.sid=[^;]+/);
    if (match) {
      await AsyncStorage.setItem(AUTH_TOKEN_KEY, match[0]);
    }
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      const res = await authFetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      } else {
        setUser(null);
        await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signup = useCallback(async (email: string, password: string) => {
    const res = await authFetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Signup failed');
    }
    await saveCookies(res);
    const data = await res.json();
    setUser(data);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Login failed');
    }
    await saveCookies(res);
    const data = await res.json();
    setUser(data);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authFetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
    setUser(null);
  }, []);

  const updateUser = useCallback((updated: AuthUser) => {
    setUser(updated);
  }, []);

  const value = useMemo(() => ({
    user,
    isLoading,
    isAuthenticated: !!user,
    needsProfileSetup: !!user && !user.username,
    signup,
    login,
    logout,
    updateUser,
  }), [user, isLoading, signup, login, logout, updateUser]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
