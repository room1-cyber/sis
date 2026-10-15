/**
 * Date helpers.
 *
 * Convention used across the app:
 *  - every persisted date is a full ISO-8601 string created from *local* time
 *    through `atNoon()` / `nowISO()`, so range comparisons work and no timezone
 *    shifting occurs;
 *  - `<input type="date">` values are converted with `toDateInput()` (local) and
 *    back with `atNoon()` (local noon => no day-boundary drift).
 */

export const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseDate(value: string | Date | undefined | null): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (DATE_ONLY_RE.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    const local = new Date(y, m - 1, d, 12, 0, 0, 0);
    return Number.isNaN(local.getTime()) ? null : local;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Local `YYYY-MM-DD` for `<input type="date">`. */
export function toDateInput(value: string | Date | undefined | null): string {
  const date = parseDate(value);
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayInput(): string {
  return toDateInput(new Date());
}

/** Converts a `YYYY-MM-DD` input value to an ISO string at local noon. */
export function atNoon(value: string | Date | undefined | null): string {
  const date = parseDate(value);
  if (!date) return '';
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0).toISOString();
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function startOfDay(value: string | Date): Date {
  const date = parseDate(value) ?? new Date();
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

export function endOfDay(value: string | Date): Date {
  const date = parseDate(value) ?? new Date();
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

export function addDays(value: string | Date, days: number): Date {
  const date = parseDate(value) ?? new Date();
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

export function addMonths(value: string | Date, months: number): Date {
  const date = parseDate(value) ?? new Date();
  const next = new Date(date.getTime());
  next.setMonth(next.getMonth() + months);
  return next;
}

export function startOfMonth(value: string | Date): Date {
  const date = parseDate(value) ?? new Date();
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

export function endOfMonth(value: string | Date): Date {
  const date = parseDate(value) ?? new Date();
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function startOfQuarter(value: string | Date): Date {
  const date = parseDate(value) ?? new Date();
  const quarterStart = Math.floor(date.getMonth() / 3) * 3;
  return new Date(date.getFullYear(), quarterStart, 1, 0, 0, 0, 0);
}

export function startOfYear(value: string | Date): Date {
  const date = parseDate(value) ?? new Date();
  return new Date(date.getFullYear(), 0, 1, 0, 0, 0, 0);
}

export function isSameDay(a: string | Date, b: string | Date): boolean {
  const da = parseDate(a);
  const db = parseDate(b);
  if (!da || !db) return false;
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

export function isSameMonth(a: string | Date, b: string | Date): boolean {
  const da = parseDate(a);
  const db = parseDate(b);
  if (!da || !db) return false;
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth();
}

export function daysBetween(a: string | Date, b: string | Date): number {
  const da = startOfDay(a);
  const db = startOfDay(b);
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

/** Positive when the date is in the future. */
export function daysUntil(value: string | Date | undefined): number | null {
  const date = parseDate(value);
  if (!date) return null;
  return daysBetween(new Date(), date);
}

export function monthKey(value: string | Date): string {
  const date = parseDate(value) ?? new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function dayKey(value: string | Date): string {
  return toDateInput(value);
}

export type PeriodKey =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisQuarter'
  | 'thisYear'
  | 'all'
  | 'custom';

export interface DateRange {
  from: Date | null;
  to: Date | null;
}

export function periodRange(period: PeriodKey, customFrom?: string, customTo?: string): DateRange {
  const now = new Date();
  switch (period) {
    case 'today':
      return { from: startOfDay(now), to: endOfDay(now) };
    case 'yesterday':
      return { from: startOfDay(addDays(now, -1)), to: endOfDay(addDays(now, -1)) };
    case 'last7':
      return { from: startOfDay(addDays(now, -6)), to: endOfDay(now) };
    case 'last30':
      return { from: startOfDay(addDays(now, -29)), to: endOfDay(now) };
    case 'thisMonth':
      return { from: startOfMonth(now), to: endOfMonth(now) };
    case 'lastMonth':
      return { from: startOfMonth(addMonths(now, -1)), to: endOfMonth(addMonths(now, -1)) };
    case 'thisQuarter':
      return { from: startOfQuarter(now), to: endOfDay(now) };
    case 'thisYear':
      return { from: startOfYear(now), to: endOfDay(now) };
    case 'custom':
      return {
        from: customFrom ? startOfDay(customFrom) : null,
        to: customTo ? endOfDay(customTo) : null,
      };
    case 'all':
    default:
      return { from: null, to: null };
  }
}

export function inRange(value: string | Date, range: DateRange): boolean {
  const date = parseDate(value);
  if (!date) return false;
  if (range.from && date.getTime() < range.from.getTime()) return false;
  if (range.to && date.getTime() > range.to.getTime()) return false;
  return true;
}

export function ageFrom(birthDate?: string): number | null {
  const date = parseDate(birthDate);
  if (!date) return null;
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const monthDiff = now.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < date.getDate())) age -= 1;
  return age < 0 ? null : age;
}

