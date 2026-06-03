'use client';

// The single toast outlet — mounted once in the root layout. It renders the
// global toast stack (see lib/toast) bottom-right, with a slide-in animation
// and an optional inline action (e.g. Undo).

import { useToasts, dismissToast, type ToastTone } from '../../lib/toast';

const toneStyles: Record<ToastTone, { dot: string; border: string }> = {
  default: { dot: 'bg-zinc-400', border: 'border-line-strong' },
  success: { dot: 'bg-emerald-400', border: 'border-emerald-500/40' },
  error: { dot: 'bg-red-400', border: 'border-red-500/40' },
};

export default function Toaster() {
  const toasts = useToasts();
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-80 flex-col gap-2">
      {toasts.map((toast) => {
        const tone = toneStyles[toast.tone];
        return (
          <div
            key={toast.id}
            className={`animate-toast-in pointer-events-auto flex items-start gap-3 rounded-xl border ${tone.border} bg-surface px-4 py-3 shadow-2xl`}
          >
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />
            <p className="flex-1 text-xs leading-relaxed text-zinc-200">{toast.message}</p>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action?.onClick();
                  dismissToast(toast.id);
                }}
                className="shrink-0 rounded-md border border-line-strong px-2 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-surface-raised"
              >
                {toast.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="shrink-0 text-zinc-600 transition-colors hover:text-zinc-300"
              aria-label="Dismiss"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
