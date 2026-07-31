import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { PublicTenant } from '../api/types';

/** Shared institute branding from the public tenant payload. */
export function useInstituteBrand(slug?: string) {
  return useQuery({
    queryKey: ['public', slug],
    enabled: Boolean(slug),
    queryFn: async () => (await api.get<PublicTenant>(`/t/${slug}/public`)).data,
    staleTime: 60_000,
  });
}

function InitialMark({
  initial,
  dims,
  className,
}: {
  initial: string;
  dims: string;
  className: string;
}) {
  return (
    <span
      className={`brand-chip inline-flex shrink-0 items-center justify-center font-extrabold ${dims} ${className}`}
    >
      {initial}
    </span>
  );
}

export function BrandMark({
  name,
  logoUrl,
  size = 'md',
  className = '',
}: {
  name?: string | null;
  logoUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const dims =
    size === 'sm' ? 'h-8 w-8 text-sm' : size === 'lg' ? 'h-12 w-12 text-xl' : 'h-10 w-10 text-lg';
  const label = (name ?? 'I').trim();
  const initial = label[0]?.toUpperCase() ?? 'I';
  const trimmedUrl = logoUrl?.trim() ?? '';

  useEffect(() => {
    setFailed(false);
  }, [trimmedUrl]);

  if (!trimmedUrl || failed) {
    return <InitialMark initial={initial} dims={dims} className={className} />;
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-white/10 ${dims} ${className}`}
    >
      <img
        src={trimmedUrl}
        alt={label}
        className="h-full w-full object-contain p-0.5"
        onError={() => setFailed(true)}
      />
    </span>
  );
}
