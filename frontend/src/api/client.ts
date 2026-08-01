import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

const ACCESS_KEY = 'lms_access_token';
const REFRESH_KEY = 'lms_refresh_token';
const PLATFORM_ACCESS_KEY = 'lms_platform_access_backup';
const PLATFORM_REFRESH_KEY = 'lms_platform_refresh_backup';
const SUPPORT_META_KEY = 'lms_support_meta';

export const tokenStore = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, _refresh?: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.removeItem(REFRESH_KEY);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
  beginSupport(accessToken: string, meta: { sessionId: string; tenantId: string; tenantSlug: string; tenantName: string }) {
    const curAccess = localStorage.getItem(ACCESS_KEY);
    if (curAccess) localStorage.setItem(PLATFORM_ACCESS_KEY, curAccess);
    localStorage.setItem(ACCESS_KEY, accessToken);
    localStorage.setItem(SUPPORT_META_KEY, JSON.stringify(meta));
  },
  endSupport() {
    const platformAccess = localStorage.getItem(PLATFORM_ACCESS_KEY);
    localStorage.removeItem(PLATFORM_ACCESS_KEY);
    localStorage.removeItem(PLATFORM_REFRESH_KEY);
    localStorage.removeItem(SUPPORT_META_KEY);
    if (platformAccess) {
      localStorage.setItem(ACCESS_KEY, platformAccess);
      return true;
    }
    return false;
  },
  getSupportMeta(): { sessionId: string; tenantId: string; tenantSlug: string; tenantName: string } | null {
    try {
      const raw = localStorage.getItem(SUPPORT_META_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
};

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStore.access;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = tokenStore.refresh;
  try {
    const { data } = await axios.post(
      '/api/auth/refresh',
      refreshToken ? { refreshToken } : {},
      { withCredentials: true }
    );
    tokenStore.set(data.accessToken, data.refreshToken);
    return data.accessToken as string;
  } catch {
    tokenStore.clear();
    return null;
  }
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      !original.url?.includes('/auth/')
    ) {
      original._retry = true;
      refreshing = refreshing ?? refreshAccessToken();
      const newToken = await refreshing;
      refreshing = null;
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
      window.dispatchEvent(new Event('lms:logout'));
    }
    return Promise.reject(error);
  }
);

/** Authenticated fetch for binary endpoints (returns a Blob). Path is relative to /api. */
export async function authFetchBlob(path: string): Promise<Blob> {
  const res = await fetch(`/api${path}`, {
    headers: { Authorization: `Bearer ${tokenStore.access}` },
  });
  if (!res.ok) throw new Error(`Request failed with ${res.status}`);
  return res.blob();
}

export function apiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return 'Cannot reach the API server. Start the backend with `npm run dev` in the backend folder.';
    }
    return (error.response?.data as { error?: string })?.error ?? error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Unexpected error';
}
