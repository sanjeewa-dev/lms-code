import { useEffect, useState } from 'react';
import { authFetchBlob } from '../api/client';

function apiPathFromImageUrl(src: string): string | null {
  if (!src) return null;
  if (/^https?:\/\//i.test(src)) return null;
  if (src.startsWith('/api/')) return src.slice(4);
  if (src.startsWith('/t/')) return src;
  return src.startsWith('/') ? src : `/${src}`;
}

export function QuestionFigure({
  src,
  className,
}: {
  src: string;
  className?: string;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const apiPath = apiPathFromImageUrl(src);

  useEffect(() => {
    if (!src || !apiPath) {
      setBlobUrl(null);
      setFailed(false);
      return;
    }
    let revoked = false;
    let objectUrl: string | null = null;
    authFetchBlob(apiPath)
      .then((blob) => {
        if (revoked) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch(() => {
        if (!revoked) setFailed(true);
      });
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, apiPath]);

  if (!src || failed) return null;
  const display = apiPath ? blobUrl : src;
  if (!display) return null;

  return (
    <img
      src={display}
      alt="Question figure"
      className={
        className ??
        'mt-3 max-h-64 w-auto max-w-full rounded-lg border border-slate-200 object-contain dark:border-white/10'
      }
    />
  );
}
