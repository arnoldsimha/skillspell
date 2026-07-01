import { useToast, type ToastMessage } from './ToastContext.js';

const TYPE_STYLES: Record<ToastMessage['type'], { bg: string; icon: string; text: string; border: string }> = {
  success: {
    bg: 'bg-emerald-50',
    icon: 'text-emerald-500',
    text: 'text-emerald-800',
    border: 'border-emerald-200',
  },
  error: {
    bg: 'bg-red-50',
    icon: 'text-red-500',
    text: 'text-red-800',
    border: 'border-red-200',
  },
  info: {
    bg: 'bg-indigo-50',
    icon: 'text-indigo-500',
    text: 'text-indigo-800',
    border: 'border-indigo-200',
  },
};

function ToastIcon({ type }: { type: ToastMessage['type'] }) {
  const style = TYPE_STYLES[type];
  if (type === 'success') {
    return (
      <div className={`flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100`}>
        <svg className={`h-4 w-4 ${style.icon}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
      </div>
    );
  }
  if (type === 'error') {
    return (
      <div className={`flex h-7 w-7 items-center justify-center rounded-lg bg-red-100`}>
        <svg className={`h-4 w-4 ${style.icon}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
        </svg>
      </div>
    );
  }
  return (
    <div className={`flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100`}>
      <svg className={`h-4 w-4 ${style.icon}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
      </svg>
    </div>
  );
}

export default function Toast() {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2.5">
      {toasts.map((toast) => {
        const style = TYPE_STYLES[toast.type];
        return (
          <div
            key={toast.id}
            className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 shadow-lg backdrop-blur-sm animate-slide-in ${style.bg} ${style.border}`}
            role="alert"
          >
            <ToastIcon type={toast.type} />
            <p className={`flex-1 pt-0.5 text-sm font-medium ${style.text}`}>{toast.message}</p>
            <button
              onClick={() => removeToast(toast.id)}
              className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-200/50 hover:text-slate-600 transition-colors"
              aria-label="Dismiss"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
