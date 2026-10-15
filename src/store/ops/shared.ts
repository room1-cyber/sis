import type { AppSettings, Database, ID, Product, StockMovement, StockMovementType } from '@/types';
import { nextNumber } from '@/lib/id';
import { nowISO } from '@/lib/date';

/* ---------------------------------------------------------------------------
 * Small immutable helpers shared by every "operation" module.
 * Operations are pure: they take the current database and return a new one, so
 * they are trivially unit testable and safe to compose.
 * ------------------------------------------------------------------------- */

export interface Actor {
  id: ID;
  name: string;
}

export const SYSTEM_ACTOR: Actor = { id: 'system', name: 'System' };

export function upsert<T extends { id: ID }>(list: T[], item: T): T[] {
  const index = list.findIndex((entry) => entry.id === item.id);
  if (index === -1) return [item, ...list];
  const copy = list.slice();
  copy[index] = item;
  return copy;
}

export function removeById<T extends { id: ID }>(list: T[], id: ID): T[] {
  return list.filter((entry) => entry.id !== id);
}

export function findById<T extends { id: ID }>(list: T[], id?: ID | null): T | undefined {
  if (!id) return undefined;
  return list.find((entry) => entry.id === id);
}

export type CounterKey =
  | 'invoices'
  | 'labOrders'
  | 'purchases'
  | 'prescriptions'
  | 'customers'
  | 'suppliers'
  | 'returns'
  | 'stockMovements';

type PrefixKey =
  | 'invoicePrefix'
  | 'labOrderPrefix'
  | 'purchasePrefix'
  | 'prescriptionPrefix'
  | 'customerPrefix'
  | 'supplierPrefix'
  | 'returnPrefix';

const COUNTER_PREFIX: Record<CounterKey, PrefixKey | null> = {
  invoices: 'invoicePrefix',
  labOrders: 'labOrderPrefix',
  purchases: 'purchasePrefix',
  prescriptions: 'prescriptionPrefix',
  customers: 'customerPrefix',
  suppliers: 'supplierPrefix',
  returns: 'returnPrefix',
  stockMovements: null,
};

/** Reserves the next sequence number for a document type. */
export function allocateNumber(db: Database, key: CounterKey): { db: Database; number: string } {
  const counters = { ...db.settings.counters };
  const value = (counters[key] ?? 0) + 1;
  counters[key] = value;
  const prefixKey = COUNTER_PREFIX[key];
  const prefix = prefixKey ? (db.settings[prefixKey] as string) : '';
  return {
    db: { ...db, settings: { ...db.settings, counters } },
    number: prefix ? nextNumber(prefix, value) : String(value),
  };
}

/** Peek at the next number without consuming it (used to preview document ids). */
export function peekNumber(settings: AppSettings, key: CounterKey): string {
  const prefixKey = COUNTER_PREFIX[key];
  const value = (settings.counters[key] ?? 0) + 1;
  const prefix = prefixKey ? (settings[prefixKey] as string) : '';
  return prefix ? nextNumber(prefix, value) : String(value);
}

/**
 * Applies a signed stock delta to a product and records the matching movement.
 * `delta` is positive for incoming and negative for outgoing quantities.
 */
export function applyStockChange(
  db: Database,
  productId: ID,
  delta: number,
  movement: {
    type: StockMovementType;
    actor: Actor;
    reference?: string;
    reason?: string;
    date?: string;
    productName?: string;
  },
): Database {
  const product = findById(db.products, productId);
  if (!product) return db;
  const previousQty = product.quantity;
  const newQty = Math.max(previousQty + delta, 0);
  const updatedProduct: Product = { ...product, quantity: newQty, updatedAt: nowISO() };

  const record: StockMovement = {
    id: `mv_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    productId,
    productName: movement.productName ?? product.nameAr,
    type: movement.type,
    quantity: delta,
    previousQty,
    newQty,
    reference: movement.reference,
    reason: movement.reason,
    userId: movement.actor.id,
    userName: movement.actor.name,
    date: movement.date ?? nowISO(),
  };

  return {
    ...db,
    products: upsert(db.products, updatedProduct),
    stockMovements: [record, ...db.stockMovements],
  };
}

/** Ensures a document collection is stored newest first. */
export function byDateDesc<T extends { createdAt: string }>(list: T[]): T[] {
  return list.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function nextTempId(prefix = 'tmp'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}
