import { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTenantApi } from '../hooks/useTenantApi';
import { authFetchBlob } from '../api/client';
import { Button, Card, Spinner } from '../components/ui';
import type { Material } from '../api/types';

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;

function clampZoom(value: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 100) / 100));
}

export default function MaterialViewer() {
  const { materialId } = useParams<{ materialId: string }>();
  const t = useTenantApi();
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [loadingPage, setLoadingPage] = useState(false);
  const [error, setError] = useState('');
  const viewportRef = useRef<HTMLDivElement>(null);

  const metaQuery = useQuery({
    queryKey: ['material-meta', t.slug, materialId],
    queryFn: async () => (await t.get<{ material: Material }>(`/materials/${materialId}/meta`)).data.material,
  });

  const pageCount = metaQuery.data?.pageCount ?? 1;
  const canPreview = metaQuery.data?.canPreview !== false;
  const price = Number(metaQuery.data?.price ?? 0);
  const locked = Boolean(metaQuery.data) && price > 0 && !canPreview;

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
    if (metaQuery.data && canPreview) loadPage(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, metaQuery.data, canPreview]);

  useEffect(() => {
    if (!locked || !materialId || !t.slug) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    (async () => {
      try {
        const blob = await authFetchBlob(`/t/${t.slug}/materials/${materialId}/thumbnail`);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setThumbUrl(objectUrl);
      } catch {
        if (!cancelled) setThumbUrl(null);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [locked, materialId, t.slug]);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setZoom((z) => clampZoom(z + delta));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  if (metaQuery.isLoading) return <Spinner label="Loading material..." />;

  if (locked) {
    return (
      <div className="space-y-4">
        <div>
          <button onClick={() => history.back()} className="text-sm text-brand-600 hover:underline">
            &larr; Back
          </button>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">{metaQuery.data?.title}</h1>
          <p className="text-sm text-slate-500">
            Paid material · Rs. {price.toLocaleString()} ·{' '}
            {metaQuery.data?.purchaseStatus === 'pending'
              ? 'payment pending approval'
              : 'payment required to unlock'}
          </p>
        </div>
        <Card className="mx-auto max-w-lg overflow-hidden rounded-2xl p-0">
          <div className="relative bg-slate-100 dark:bg-white/5">
            {thumbUrl ? (
              <img src={thumbUrl} alt="" className="mx-auto max-h-80 w-full object-contain opacity-80" />
            ) : (
              <div className="grid h-56 place-items-center text-sm text-slate-400">Thumbnail unavailable</div>
            )}
            <div className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-slate-950/70 to-transparent p-6">
              <div className="text-center text-white">
                <p className="text-sm font-semibold">Full preview locked</p>
                <p className="mt-1 text-xs text-white/80">
                  Upload a payment slip from Material payments. After approval you can read every page.
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 p-4">
            <Link to={`/${t.slug}/payments?section=materials&materialId=${materialId}`}>
              <Button>
                {metaQuery.data?.purchaseStatus === 'pending' ? 'View payment status' : 'Pay to unlock'}
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const zoomPercent = Math.round(zoom * 100);

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
        <div className="mb-3 flex w-full flex-wrap items-center justify-center gap-3">
          <div className="flex items-center gap-2">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="text-sm text-slate-600 dark:text-slate-300">
              Page {page} / {pageCount}
            </span>
            <Button
              variant="secondary"
              disabled={page >= pageCount}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              disabled={zoom <= ZOOM_MIN}
              onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))}
            >
              −
            </Button>
            <span className="min-w-[3.5rem] text-center text-sm text-slate-600 dark:text-slate-300">
              {zoomPercent}%
            </span>
            <Button
              variant="secondary"
              disabled={zoom >= ZOOM_MAX}
              onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}
            >
              +
            </Button>
            <Button variant="secondary" onClick={() => setZoom(1)}>
              Reset
            </Button>
          </div>
        </div>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        {loadingPage && <Spinner label="Rendering page..." />}

        <div
          ref={viewportRef}
          className="w-full overflow-auto rounded-lg border border-slate-100 bg-slate-50 dark:border-white/5 dark:bg-ink-900"
          style={{ maxHeight: '70vh' }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="flex min-h-full justify-center p-4">
            {imageUrl && (
              <div style={{ width: `${zoomPercent}%` }} className="shrink-0">
                <img
                  src={imageUrl}
                  alt={`Page ${page}`}
                  className="h-auto w-full select-none"
                  draggable={false}
                />
              </div>
            )}
          </div>
        </div>
        <p className="mt-2 text-center text-xs text-slate-400">
          Ctrl/Cmd + scroll to zoom · watermarked view-only copy
        </p>
      </Card>
    </div>
  );
}
