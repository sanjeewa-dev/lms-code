import { useRef, useState } from 'react';
import { QuestionFigure } from './QuestionFigure';

export function FigureEditor({
  imageUrl,
  disabled,
  onChange,
  onUploadFile,
}: {
  imageUrl?: string;
  disabled?: boolean;
  onChange: (url: string | null) => void;
  onUploadFile: (file: File) => Promise<string>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pastedUrl = imageUrl && /^https?:\/\//i.test(imageUrl) ? imageUrl : '';

  async function onFile(file: File | null) {
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      const url = await onUploadFile(file);
      onChange(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload figure');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="mt-3 space-y-2">
      {imageUrl ? (
        <div className="flex flex-wrap items-start gap-3">
          <QuestionFigure src={imageUrl} className="max-h-40 w-auto max-w-full rounded-lg border border-slate-200 object-contain dark:border-white/10" />
          {!disabled && (
            <button
              type="button"
              className="text-xs font-semibold text-red-600 hover:underline"
              onClick={() => onChange(null)}
            >
              Remove figure
            </button>
          )}
        </div>
      ) : null}
      {!disabled && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-slate-500">
            Figure
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
              disabled={busy}
              className="ml-2 block w-full max-w-xs text-xs text-slate-600 file:mr-2 file:rounded-md file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs file:font-semibold dark:file:bg-white/10"
              onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <label className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-slate-500 sm:max-w-xs">
            or URL
            <input
              className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 dark:border-white/10 dark:bg-white/5"
              placeholder="https://…"
              value={pastedUrl}
              onChange={(e) => {
                const v = e.target.value.trim();
                onChange(v ? v : null);
              }}
              disabled={busy}
            />
          </label>
        </div>
      )}
      {busy && <p className="text-xs text-slate-500">Uploading figure…</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
