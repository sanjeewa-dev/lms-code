import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, tokenStore } from '../api/client';
import type { AuthResponse, User } from '../api/types';

export type UnifiedLoginResult =
  | { kind: 'ok'; user: User; tenant: { slug: string; name: string } | null }
  | { kind: 'multiple'; tenants: { slug: string; name: string }[] };

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, tenantSlug?: string) => Promise<UnifiedLoginResult>;
  loginPlatform: (email: string, password: string) => Promise<User>;
  loginTenant: (slug: string, email: string, password: string) => Promise<User>;
  registerTenant: (slug: string, input: { name: string; email: string; password: string }) => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUser: (user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      if (!tokenStore.access) {
        setLoading(false);
        return;
      }
      try {
        const { data } = await api.get<{ user: User }>('/auth/me');
        if (active) setUser(data.user);
      } catch {
        tokenStore.clear();
      } finally {
        if (active) setLoading(false);
      }
    }
    bootstrap();

    const onLogout = () => {
      tokenStore.clear();
      setUser(null);
      // Session expired / token refresh failed -> back to the unified server login.
      navigate('/login', { replace: true });
    };
    window.addEventListener('lms:logout', onLogout);
    return () => {
      active = false;
      window.removeEventListener('lms:logout', onLogout);
    };
  }, []);

  async function handleAuth(data: AuthResponse) {
    tokenStore.set(data.accessToken, data.refreshToken);
    setUser(data.user);
    return data.user;
  }

  async function login(email: string, password: string, tenantSlug?: string): Promise<UnifiedLoginResult> {
    const { data } = await api.post('/auth/login', { email, password, tenantSlug });
    if (data.multiple) {
      return { kind: 'multiple', tenants: data.tenants as { slug: string; name: string }[] };
    }
    const user = await handleAuth(data as AuthResponse);
    return { kind: 'ok', user, tenant: data.tenant ?? null };
  }

  async function loginPlatform(email: string, password: string) {
    const { data } = await api.post<AuthResponse>('/admin/auth/login', { email, password });
    return handleAuth(data);
  }

  async function loginTenant(slug: string, email: string, password: string) {
    const { data } = await api.post<AuthResponse>(`/t/${slug}/auth/login`, { email, password });
    return handleAuth(data);
  }

  async function registerTenant(slug: string, input: { name: string; email: string; password: string }) {
    // New students are created as "pending" and must be approved before sign-in.
    await api.post(`/t/${slug}/auth/register`, input);
  }

  function logout() {
    const refreshToken = tokenStore.refresh;
    if (refreshToken) api.post('/auth/logout', { refreshToken }).catch(() => undefined);
    tokenStore.clear();
    setUser(null);
    navigate('/login', { replace: true });
  }

  async function refreshUser() {
    const { data } = await api.get<{ user: User }>('/auth/me');
    setUser(data.user);
  }

  function updateUser(next: User) {
    setUser(next);
  }

  const value = useMemo(
    () => ({ user, loading, login, loginPlatform, loginTenant, registerTenant, refreshUser, updateUser, logout }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
