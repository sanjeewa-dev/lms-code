import { useParams } from 'react-router-dom';
import type { AxiosRequestConfig } from 'axios';
import { api, authFetchBlob } from '../api/client';

/**
 * Returns an API helper bound to the current tenant slug (from the route),
 * automatically prefixing all paths with /t/:slug.
 */
export function useTenantApi() {
  const { slug } = useParams<{ slug: string }>();
  const base = `/t/${slug}`;
  return {
    slug: slug ?? '',
    get: <T = unknown>(path: string, config?: AxiosRequestConfig) => api.get<T>(`${base}${path}`, config),
    post: <T = unknown>(path: string, body?: unknown, config?: AxiosRequestConfig) =>
      api.post<T>(`${base}${path}`, body, config),
    patch: <T = unknown>(path: string, body?: unknown) => api.patch<T>(`${base}${path}`, body),
    del: <T = unknown>(path: string) => api.delete<T>(`${base}${path}`),
    fetchBlob: (path: string) => authFetchBlob(`${base}${path}`),
  };
}
