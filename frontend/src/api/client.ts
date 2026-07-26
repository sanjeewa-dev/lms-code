import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

const ACCESS_KEY = 'lms_access_token';
const REFRESH_KEY = 'lms_refresh_token';

export const tokenStore = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export const api = axios.create({
  baseURL: '/api',
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
  if (!refreshToken) return null;
  try {
    const { data } = await axios.post('/api/auth/refresh', { refreshToken });
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
    return (error.response?.data as { error?: string })?.error ?? error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Unexpected error';
}
