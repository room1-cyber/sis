import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { uid } from '@/lib/id';
import type { Toast } from '@/types';
import { useI18n } from '@/i18n';

/* ---------------------------------------------------------------------------
 * Toasts + confirmation dialogs.
 * Both are exposed as hooks so any page can trigger them without prop drilling.
 * ------------------------------------------------------------------------- */

type ToastKind = Toast['kind'];

interface ToastContextValue {
  toasts: Toast[];
  push: (message: string, kind?: ToastKind) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE: Record<ToastKind, { box: string; icon: string }> = {
  success: { box: 'border-emerald-200 bg-emerald-50 text-emerald-900', icon: '✅' },
  error: { box: 'border-rose-200 bg-rose-50 text-rose-900', icon: '⛔' },
  info: { box: 'border-sky-200 bg-sky-50 text-sky-900', icon: 'ℹ️' },
  warning: { box: 'border-amber-200 bg-amber-50 text-amber-900', icon: '⚠️' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (message: string, kind: ToastKind = 'success') => {
      const toast: Toast = { id: uid('toast'), kind, message };
      setToasts((current) => [...current.slice(-3), toast]);
      window.setTimeout(() => dismiss(toast.id), kind === 'error' ? 6000 : 3600);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toasts,
      push,
      dismiss,
      success: (message: string) => push(message, 'success'),
      error: (message: string) => push(message, 'error'),
      info: (message: string) => push(message, 'info'),
      warning: (message: string) => push(message, 'warning'),
    }),
    [toasts, push, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 z-[60] flex w-full flex-col items-center gap-2 px-4 sm:items-end sm:pe-6">
        {toasts.map((toast) => (
          <button
            key={toast.id}
            type="button"
            onClick={() => dismiss(toast.id)}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-xl border px-4 py-3 text-start text-sm font-semibold shadow-pop animate-slide-in ${TONE[toast.kind].box}`}
          >
            <span aria-hidden>{TONE[toast.kind].icon}</span>
            <span className="flex-1">{toast.message}</span>
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

/* ----------------------------- Confirm dialog ------------------------------ */

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback<ConfirmFn>(
    (options) => new Promise<boolean>((resolve) => setPending({ ...options, resolve })),
    [],
  );

  const settle = (value: boolean) => {
    pending?.resolve(value);
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4 animate-fade-in">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-pop animate-scale-in">
            <h3 className="mb-2 text-lg font-bold text-slate-900">
              {pending.title ?? t('common.deleteConfirmTitle')}
            </h3>
            <p className="mb-5 text-sm leading-6 text-slate-600">{pending.message}</p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => settle(false)}>
                {pending.cancelLabel ?? t('common.cancel')}
              </button>
              <button
                type="button"
                className={pending.tone === 'primary' ? 'btn-primary' : 'btn-danger'}
                onClick={() => settle(true)}
              >
                {pending.confirmLabel ?? t('common.confirmDelete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ctx;
}
