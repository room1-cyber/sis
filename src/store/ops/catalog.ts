import type { Database, ID, Product, Supplier } from '@/types';
import { nowISO } from '@/lib/date';
import { uid } from '@/lib/id';
import { allocateNumber, applyStockChange, findById, removeById, upsert, type Actor } from './shared';

/* ---------------------------------------------------------------------------
 * Catalog operations: products, stock adjustments and suppliers.
 * ------------------------------------------------------------------------- */

export type ProductInput = Omit<Product, 'id' | 'createdAt' | 'updatedAt'>;
export type SupplierInput = Omit<Supplier, 'id' | 'createdAt'>;

export function addProduct(db: Database, input: ProductInput): { db: Database; product: Product } {
  const timestamp = nowISO();
  const product: Product = { ...input, id: uid('prd'), createdAt: timestamp, updatedAt: timestamp };
  return { db: { ...db, products: [product, ...db.products] }, product };
}

export function updateProduct(db: Database, id: ID, patch: Partial<ProductInput>): Database {
  const existing = findById(db.products, id);
  if (!existing) return db;
  const updated: Product = { ...existing, ...patch, id, updatedAt: nowISO() };
  return { ...db, products: upsert(db.products, updated) };
}

/** Deletes a product. Historical documents keep their own snapshot of the data. */
export function deleteProduct(db: Database, id: ID): Database {
  return { ...db, products: removeById(db.products, id) };
}

export interface StockAdjustInput {
  productId: ID;
  /** 'in' adds, 'out' removes and 'set' overrides the quantity. */
  mode: 'in' | 'out' | 'set';
  quantity: number;
  reason?: string;
  reference?: string;
}

export function adjustStock(db: Database, input: StockAdjustInput, actor: Actor): Database {
  const product = findById(db.products, input.productId);
  if (!product) return db;
  const amount = Math.abs(input.quantity);
  const delta =
    input.mode === 'in' ? amount : input.mode === 'out' ? -amount : amount - product.quantity;
  if (delta === 0) return db;
  return applyStockChange(db, input.productId, delta, {
    type: input.mode === 'in' ? 'in' : input.mode === 'out' ? 'out' : 'adjust',
    actor,
    reason: input.reason,
    reference: input.reference,
  });
}

export function addSupplier(db: Database, input: SupplierInput): { db: Database; supplier: Supplier } {
  const allocation = allocateNumber(db, 'suppliers');
  const supplier: Supplier = {
    ...input,
    code: input.code || allocation.number,
    id: uid('sup'),
    createdAt: nowISO(),
  };
  return { db: { ...allocation.db, suppliers: [supplier, ...allocation.db.suppliers] }, supplier };
}

export function updateSupplier(db: Database, id: ID, patch: Partial<SupplierInput>): Database {
  const existing = findById(db.suppliers, id);
  if (!existing) return db;
  return { ...db, suppliers: upsert(db.suppliers, { ...existing, ...patch, id }) };
}

export function deleteSupplier(db: Database, id: ID): Database {
  return { ...db, suppliers: removeById(db.suppliers, id) };
}

/** Adds a payment towards a supplier balance (negative balance = credit with us). */
export function paySupplier(db: Database, id: ID, amount: number): Database {
  const supplier = findById(db.suppliers, id);
  if (!supplier) return db;
  return {
    ...db,
    suppliers: upsert(db.suppliers, { ...supplier, balance: supplier.balance - Math.abs(amount) }),
  };
}
