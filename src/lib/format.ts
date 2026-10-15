import type { Lang } from '@/types';

/* ---------------------------------------------------------------------------
 * Locale aware formatting for numbers, money and dates.
 * All helpers are pure functions so they are easy to unit test.
 * ------------------------------------------------------------------------- */

export interface FmtOptions {
  lang: Lang;
  /** ISO-4217 currency code. Defaults to SAR. */
  currency?: string;
  /** 'arab' renders ٠١٢٣٤٥٦٧٨٩ instead of 0123456789 (Arabic UI only). */
  numerals?: 'latn' | 'arab';
  /** Display dates using the Hijri (Umm al-Qura) calendar. */
  hijri?: boolean;
}

export const DEFAULT_CURRENCY = 'SAR';

type Calendar = 'gregory' | 'islamic';

export function localeTag(options: FmtOptions, calendar: Calendar = 'gregory'): string {
  const base = options.lang === 'ar' ? 'ar' : 'en-US';
  const parts: string[] = [];
  if (options.lang === 'ar') parts.push(options.numerals === 'arab' ? 'nu-arab' : 'nu-latn');
  if (options.hijri && calendar === 'islamic') parts.push('ca-islamic-umalqura');
  return parts.length > 0 ? `${base}-u-${parts.join('-')}` : base;
}

function safeIntl<T>(fn: () => T, fallback: () => T): T {
  try {
    return fn();
  } catch {
    return fallback();
  }
}

export function formatNumber(value: number, options: FmtOptions, intl?: Intl.NumberFormatOptions): string {
  if (!Number.isFinite(value)) return '—';
  return safeIntl(
    () => new Intl.NumberFormat(localeTag(options), intl).format(value),
    () => String(value),
  );
}

/** Money with the store currency: `1,250.00 ر.س` / `SAR 1,250.00`. */
export function formatMoney(value: number, options: FmtOptions): string {
  const currency = options.currency || DEFAULT_CURRENCY;
  const amount = Number.isFinite(value) ? value : 0;
  return safeIntl(
    () =>
      new Intl.NumberFormat(localeTag(options), {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        currencyDisplay: 'symbol',
      }).format(amount),
    () => `${formatNumber(amount, { ...options, numerals: 'latn' }, { minimumFractionDigits: 2 })} ${currency}`,
  );
}

/** Compact money without decimals – used in KPI cards and charts. */
export function formatMoneyShort(value: number, options: FmtOptions): string {
  const currency = options.currency || DEFAULT_CURRENCY;
  const amount = Number.isFinite(value) ? value : 0;
  return safeIntl(
    () =>
      new Intl.NumberFormat(localeTag(options), {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
        notation: Math.abs(amount) >= 100000 ? 'compact' : 'standard',
      }).format(amount),
    () => `${Math.round(amount)} ${currency}`,
  );
}

export function formatPercent(value: number, options: FmtOptions, digits = 1): string {
  return formatNumber(value / 100, options, {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

export function formatDate(iso: string | Date | undefined, options: FmtOptions): string {
  if (!iso) return '—';
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return '—';
  return safeIntl(
    () =>
      new Intl.DateTimeFormat(localeTag(options, options.hijri ? 'islamic' : 'gregory'), {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
      }).format(date),
    () => date.toISOString().slice(0, 10),
  );
}

export function formatDateLong(iso: string | Date | undefined, options: FmtOptions): string {
  if (!iso) return '—';
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return '—';
  return safeIntl(
    () =>
      new Intl.DateTimeFormat(localeTag(options, options.hijri ? 'islamic' : 'gregory'), {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(date),
    () => date.toISOString().slice(0, 10),
  );
}

export function formatTime(iso: string | Date | undefined, options: FmtOptions): string {
  if (!iso) return '—';
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return '—';
  return safeIntl(
    () =>
      new Intl.DateTimeFormat(localeTag(options), {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).format(date),
    () => date.toTimeString().slice(0, 5),
  );
}

export function formatDateTime(iso: string | Date | undefined, options: FmtOptions): string {
  if (!iso) return '—';
  return `${formatDate(iso, options)} ${formatTime(iso, options)}`;
}

export function formatMonth(iso: string, options: FmtOptions): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return safeIntl(
    () =>
      new Intl.DateTimeFormat(localeTag(options, options.hijri ? 'islamic' : 'gregory'), {
        month: 'short',
        year: '2-digit',
      }).format(date),
    () => iso.slice(0, 7),
  );
}

/** Diopter formatting: `+1.25` / `-0.75` / `—` (kept in Latin digits on purpose). */
export function formatDiopter(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const rounded = Math.round(value * 100) / 100;
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded.toFixed(2)}`;
}

export function formatAxis(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return String(Math.round(value));
}

export function formatPupillaryDistance(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${Math.round(value * 10) / 10} mm`;
}

export function formatQuantity(value: number, options: FmtOptions): string {
  return formatNumber(value, options, { maximumFractionDigits: 2 });
}
