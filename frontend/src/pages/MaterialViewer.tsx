import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTenantApi } from '../hooks/useTenantApi';
import { Button, Card, Spinner } from '../components/ui';
import type { Material } from '../api/types';

export default function MaterialViewer() {
  const { materialId } = useParams<{ materialId: string }>();
  const t = useTenantApi();
  const [page, setPage] = useState(1);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loadingPage, setLoadingPage] = useState(false);
  const [error, setError] = useState('');

  const metaQuery = useQuery({
    queryKey: ['material-meta', t.slug, materialId],
    queryFn: async () => (await t.get<{ material: Material }>(`/materials/${materialId}/meta`)).data.material,
  });

  const pageCount = metaQuery.data?.pageCount ?? 1;

  const loadPage = useCallback(
    async (n: number) => {
      setLoadingPage(true);
      setError('');
      try {
        const blob = await t.fetchBlob(`/materials/${materialId}/pages/${n}`);
        setImageUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
      } catch {
        setError('Unable to load this page.');
      } finally {
        setLoadingPage(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [materialId]
  );

  useEffect(() => {
    if (metaQuery.data) loadPage(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, metaQuery.data]);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (metaQuery.isLoading) return <Spinner label="Loading material..." />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <button onClick={() => history.back()} className="text-sm text-brand-600 hover:underline">
            &larr; Back
          </button>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">{metaQuery.data?.title}</h1>
        </div>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
          View only &middot; downloading disabled
        </span>
      </div>

      <Card className="flex flex-col items-center">
        <div className="mb-3 flex items-center gap-3">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-slate-600 dark:text-slate-300">
            Page {page} of {pageCount}
          </span>
          <Button variant="secondary" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>

        <div
          className="no-select relative flex min-h-[400px] w-full justify-center overflow-hidden rounded-lg bg-slate-100 dark:bg-white/5"
          onContextMenu={(e) => e.preventDefault()}
        >
          {loadingPage && <Spinner />}
          {error && <p className="p-6 text-sm text-red-600">{error}</p>}
          {!loadingPage && !error && imageUrl && (
            <img
              src={imageUrl}
              alt={`Page ${page}`}
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              className="no-select max-h-[80vh] w-auto select-none"
            />
          )}
          <div className="pointer-events-none absolute inset-0" />
        </div>
      </Card>
    </div>
  );
}
