/**
 * Tiny id / sequence helpers. Ids are random, URL safe and unique enough for a
 * single-store local database.
 */

export function uid(prefix = 'id'): string {
  const rand = Math.random().toString(36).slice(2, 8);
  const time = Date.now().toString(36);
  return `${prefix}_${time}${rand}`;
}

/** Deterministic-ish numeric suffix used by sequential document numbers. */
export function pad(num: number, size = 4): string {
  return String(num).padStart(size, '0');
}

/**
 * Builds the next document number, e.g. `nextNumber('INV', 12)` -> `INV-0012`.
 * The counter is stored in settings.counters by the data layer.
 */
export function nextNumber(prefix: string, counter: number, size = 4): string {
  return `${prefix}-${pad(counter, size)}`;
}

export function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
