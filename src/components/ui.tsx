import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useI18n } from '@/i18n';

/* ---------------------------------------------------------------------------
 * Shared UI kit. Styling comes from the component classes defined in
 * `src/index.css` so the markup stays terse and consistent.
 * ------------------------------------------------------------------------- */

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-extrabold text-slate-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = '',
  padded = true,
  bodyClassName = '',
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
  bodyClassName?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
          <div>
            {title && <h2 className="card-title">{title}</h2>}
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={`${padded ? 'card-pad' : ''} ${bodyClassName}`}>{children}</div>
    </section>
  );
}

export type Tone = 'brand' | 'green' | 'red' | 'amber' | 'blue' | 'violet' | 'gray';

const TONE_ICON: Record<Tone, string> = {
  brand: 'bg-brand-50 text-brand-700',
  green: 'bg-emerald-50 text-emerald-600',
  red: 'bg-rose-50 text-rose-600',
  amber: 'bg-amber-50 text-amber-600',
  blue: 'bg-sky-50 text-sky-600',
  violet: 'bg-violet-50 text-violet-600',
  gray: 'bg-slate-100 text-slate-600',
};

const TONE_BADGE: Record<Tone, string> = {
  brand: 'badge-brand',
  green: 'badge-green',
  red: 'badge-red',
  amber: 'badge-amber',
  blue: 'badge-blue',
  violet: 'badge-violet',
  gray: 'badge-gray',
};

export function Badge({ tone = 'gray', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={TONE_BADGE[tone]}>{children}</span>;
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'brand',
  onClick,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  onClick?: () => void;
}) {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`card flex items-center gap-4 p-4 text-start ${
        onClick ? 'transition hover:-translate-y-0.5 hover:shadow-pop' : ''
      }`}
    >
      {icon && <span className={`kpi-icon ${TONE_ICON[tone]}`}>{icon}</span>}
      <div className="min-w-0">
        <p className="truncate text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="stat-value">{value}</p>
        {hint && <p className="mt-0.5 truncate text-xs text-slate-400">{hint}</p>}
      </div>
    </Wrapper>
  );
}

export function EmptyState({
  icon = '📭',
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="text-3xl" aria-hidden>
        {icon}
      </span>
      <p className="font-semibold text-slate-500">{title}</p>
      {hint && <p className="max-w-sm text-xs">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Field({
  label,
  error,
  hint,
  required,
  children,
  className = '',
}: {
  label?: ReactNode;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      {label && (
        <span className="label">
          {label}
          {required && <span className="ms-1 text-rose-500">*</span>}
        </span>
      )}
      {children}
      {error ? (
        <span className="field-error">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>
      )}
    </label>
  );
}

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

const MODAL_SIZE: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-6xl',
};

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-3 animate-fade-in sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={`my-4 w-full ${MODAL_SIZE[size]} rounded-2xl bg-white shadow-pop animate-scale-in`}>
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="close">
            ✕
          </button>
        </header>
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  className = '',
}: {
  tabs: Array<{ key: T; label: ReactNode; count?: number }>;
  active: T;
  onChange: (key: T) => void;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-1 rounded-xl bg-white p-1 shadow-card ${className}`}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={`tab ${active === tab.key ? 'tab-active' : ''}`}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className={`ms-1.5 text-xs ${active === tab.key ? 'text-white/80' : 'text-slate-400'}`}>
              ({tab.count})
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  autoFocus,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <div className={`relative ${className}`}>
      <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-slate-400">🔍</span>
      <input
        className="input ps-9"
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder ?? t('common.searchPlaceholder')}
        onChange={(event) => onChange(event.target.value)}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute inset-y-0 end-2 flex items-center px-2 text-slate-400 hover:text-slate-600"
          aria-label="clear"
        >
          ✕
        </button>
      )}
    </div>
  );
}

export function Toolbar({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mb-4 flex flex-wrap items-center gap-2 ${className}`}>{children}</div>;
}

/* -------------------------------- DataTable -------------------------------- */

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  className?: string;
  align?: 'start' | 'center' | 'end';
  /** Provide a value to make the column sortable. */
  sortValue?: (row: T) => string | number;
}

const ALIGN: Record<'start' | 'center' | 'end', string> = {
  start: 'text-start',
  center: 'text-center',
  end: 'text-end',
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  pageSize,
  initialSort,
  onRowClick,
  dense,
  footer,
}: {
  columns: Array<Column<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
  pageSize?: number;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  onRowClick?: (row: T) => void;
  dense?: boolean;
  footer?: ReactNode;
}) {
  const { t } = useI18n();
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(pageSize ?? 25);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((item) => item.key === sort.key);
    if (!column?.sortValue) return rows;
    const factor = sort.dir === 'asc' ? 1 : -1;
    const sortValue = column.sortValue;
    return rows.slice().sort((a, b) => {
      const left = sortValue(a);
      const right = sortValue(b);
      if (typeof left === 'number' && typeof right === 'number') return (left - right) * factor;
      return String(left).localeCompare(String(right), 'ar') * factor;
    });
  }, [rows, sort, columns]);

  const pageCount = pageSize ? Math.max(Math.ceil(sorted.length / size), 1) : 1;
  const currentPage = Math.min(page, pageCount);
  const visible = pageSize ? sorted.slice((currentPage - 1) * size, currentPage * size) : sorted;

  const toggleSort = (key: string) => {
    setSort((current) => {
      if (current?.key !== key) return { key, dir: 'asc' };
      if (current.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  };

  if (rows.length === 0) {
    return <div className="table-wrap">{empty ?? <EmptyState title={t('common.noData')} />}</div>;
  }

  return (
    <div className="space-y-3">
      <div className="table-wrap">
        <table className={`table ${dense ? 'table-compact' : ''}`}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={ALIGN[column.align ?? 'start']}>
                  {column.sortValue ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-slate-800"
                      onClick={() => toggleSort(column.key)}
                    >
                      {column.header}
                      <span className="text-[10px]">
                        {sort?.key === column.key ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={onRowClick ? 'cursor-pointer' : undefined}
              >
                {columns.map((column) => (
                  <td key={column.key} className={`${ALIGN[column.align ?? 'start']} ${column.className ?? ''}`}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {footer && <tfoot className="bg-slate-50 font-bold text-slate-700">{footer}</tfoot>}
        </table>
      </div>

      {pageSize && sorted.length > size && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
          <span>
            {t('common.showing')} {(currentPage - 1) * size + 1}–{Math.min(currentPage * size, sorted.length)}{' '}
            {t('common.of')} {sorted.length}
          </span>
          <div className="flex items-center gap-2">
            <select
              className="select w-auto py-1 text-xs"
              value={size}
              onChange={(event) => {
                setSize(Number(event.target.value));
                setPage(1);
              }}
            >
              {[10, 25, 50, 100].map((option) => (
                <option key={option} value={option}>
                  {option} / {t('common.page')}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="btn-secondary btn-sm"
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
              >
                ‹
              </button>
              <span className="px-2 text-xs font-bold text-slate-600">
                {currentPage} / {pageCount}
              </span>
              <button
                type="button"
                className="btn-secondary btn-sm"
                disabled={currentPage >= pageCount}
                onClick={() => setPage(currentPage + 1)}
              >
                ›
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


