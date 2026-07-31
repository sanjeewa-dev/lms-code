import { useEffect, useState } from 'react';

type ToastTone = 'success' | 'error';

type ToastItem = {
  id: number;
  message: string;
  tone: ToastTone;
};

type ToastInput = { message: string; tone?: ToastTone };

let pushToast: ((input: ToastInput) => void) | null = null;
let seq = 0;

/** Show a transient toast (matches Live Class success/error banner styling). */
export function showToast(message: string, tone: ToastTone = 'success') {
  pushToast?.({ message, tone });
}

const toneClass: Record<ToastTone, string> = {
  success:
    'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950/30 dark:text-green-300',
  error:
    'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300',
};

/** Mount once near the app root (e.g. TenantLayout). */
export function AppToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    pushToast = ({ message, tone = 'success' }) => {
      const id = ++seq;
      setItems((prev) => [...prev, { id, message, tone }]);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== id));
      }, 5000);
    };
    return () => {
      pushToast = null;
    };
  }, []);

  if (!items.length) return null;

  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[80] flex w-[min(100%-2rem,28rem)] -translate-x-1/2 flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto rounded-xl border px-4 py-3 text-sm shadow-lg ${toneClass[t.tone]}`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
