import type { Database, ID, LabOrder, LabOrderStatus, Purchase, PurchaseLine, PurchaseStatus } from '@/types';
import { nowISO } from '@/lib/date';
import { uid } from '@/lib/id';
import { round2 } from '@/lib/calc';
import { allocateNumber, applyStockChange, findById, removeById, upsert, type Actor } from './shared';

/* ---------------------------------------------------------------------------
 * Workflow operations: lab (glazing) orders and purchase orders.
 * ------------------------------------------------------------------------- */

export type LabOrderInput = Omit<
  LabOrder,
  'id' | 'number' | 'createdAt' | 'updatedAt' | 'userId' | 'userName'
> & { number?: string };

/** Status order used by the "advance status" action on the lab orders page. */
export const LAB_STATUS_FLOW: LabOrderStatus[] = [
  'draft',
  'sent_to_lab',
  'in_lab',
  'received',
  'ready',
  'delivered',
];

export function nextLabStatus(status: LabOrderStatus): LabOrderStatus {
  const index = LAB_STATUS_FLOW.indexOf(status);
  if (index === -1 || index === LAB_STATUS_FLOW.length - 1) return status;
  return LAB_STATUS_FLOW[index + 1];
}

function datesForStatus(status: LabOrderStatus, current: LabOrder): Partial<LabOrder> {
  const today = nowISO();
  switch (status) {
    case 'sent_to_lab':
      return { sentDate: current.sentDate ?? today };
    case 'received':
    case 'ready':
      return { receivedDate: current.receivedDate ?? today };
    case 'delivered':
      return { deliveredDate: current.deliveredDate ?? today, receivedDate: current.receivedDate ?? today };
    default:
      return {};
  }
}

export function createLabOrder(db: Database, input: LabOrderInput, actor: Actor): { db: Database; order: LabOrder } {
  const allocation = allocateNumber(db, 'labOrders');
  const timestamp = nowISO();
  const order: LabOrder = {
    ...input,
    number: input.number || allocation.number,
    id: uid('lab'),
    userId: actor.id,
    userName: actor.name,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return { db: { ...allocation.db, labOrders: [order, ...allocation.db.labOrders] }, order };
}

export function updateLabOrder(db: Database, id: ID, patch: Partial<LabOrderInput>): Database {
  const existing = findById(db.labOrders, id);
  if (!existing) return db;
  return { ...db, labOrders: upsert(db.labOrders, { ...existing, ...patch, id, updatedAt: nowISO() }) };
}

export function setLabOrderStatus(db: Database, id: ID, status: LabOrderStatus): Database {
  const existing = findById(db.labOrders, id);
  if (!existing) return db;
  const updated: LabOrder = { ...existing, ...datesForStatus(status, existing), status, updatedAt: nowISO() };
  return { ...db, labOrders: upsert(db.labOrders, updated) };
}

export function advanceLabOrder(db: Database, id: ID): Database {
  const existing = findById(db.labOrders, id);
  if (!existing) return db;
  return setLabOrderStatus(db, id, nextLabStatus(existing.status));
}

export function deleteLabOrder(db: Database, id: ID): Database {
  return { ...db, labOrders: removeById(db.labOrders, id) };
}

/* ------------------------------- Purchases --------------------------------- */

export interface PurchaseLineInput {
  productId: ID;
  quantity: number;
  unitCost: number;
}

export interface PurchaseInput {
  supplierId: ID;
  date: string;
  expectedDate?: string;
  lines: PurchaseLineInput[];
  paid: number;
  status: PurchaseStatus;
  notes?: string;
  taxRate?: number;
}

export function createPurchase(db: Database, input: PurchaseInput, actor: Actor): { db: Database; purchase: Purchase } {
  const allocation = allocateNumber(db, 'purchases');
  const supplier = findById(allocation.db.suppliers, input.supplierId);

  const lines: PurchaseLine[] = input.lines
    .map((line) => {
      const product = findById(allocation.db.products, line.productId);
      if (!product) return null;
      return {
        id: uid('pline'),
        productId: product.id,
        sku: product.sku,
        nameAr: product.nameAr,
        nameEn: product.nameEn,
        quantity: Math.max(Math.floor(line.quantity), 0),
        receivedQty: 0,
        unitCost: round2(line.unitCost),
      } satisfies PurchaseLine;
    })
    .filter((line): line is PurchaseLine => line !== null);

  const subtotal = round2(lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0));
  const taxRate = input.taxRate ?? allocation.db.settings.taxRate;
  const taxAmount = round2(subtotal * (taxRate / 100));
  const total = round2(subtotal + taxAmount);

  const purchase: Purchase = {
    id: uid('pur'),
    number: allocation.number,
    supplierId: input.supplierId,
    supplierName: supplier?.name ?? '—',
    date: input.date,
    expectedDate: input.expectedDate,
    lines,
    subtotal,
    taxAmount,
    total,
    paid: round2(Math.min(Math.max(input.paid, 0), total)),
    status: input.status,
    notes: input.notes,
    userId: actor.id,
    userName: actor.name,
    createdAt: nowISO(),
  };

  // Ordering from a supplier increases what we owe them.
  let next: Database = { ...allocation.db, purchases: [purchase, ...allocation.db.purchases] };
  if (supplier && input.status !== 'cancelled') {
    next = {
      ...next,
      suppliers: upsert(next.suppliers, {
        ...supplier,
        balance: round2(supplier.balance + total - purchase.paid),
      }),
    };
  }
  return { db: next, purchase };
}

export function updatePurchase(db: Database, id: ID, patch: Partial<PurchaseInput>): Database {
  const existing = findById(db.purchases, id);
  if (!existing) return db;

  const lines = patch.lines
    ? patch.lines
        .map((line) => {
          const product = findById(db.products, line.productId);
          if (!product) return null;
          const previous = existing.lines.find((entry) => entry.productId === line.productId);
          return {
            id: previous?.id ?? uid('pline'),
            productId: product.id,
            sku: product.sku,
            nameAr: product.nameAr,
            nameEn: product.nameEn,
            quantity: Math.max(Math.floor(line.quantity), 0),
            receivedQty: previous?.receivedQty ?? 0,
            unitCost: round2(line.unitCost),
          } satisfies PurchaseLine;
        })
        .filter((line): line is PurchaseLine => line !== null)
    : existing.lines;

  const subtotal = round2(lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0));
  const taxRate = patch.taxRate ?? db.settings.taxRate;
  const taxAmount = round2(subtotal * (taxRate / 100));
  const total = round2(subtotal + taxAmount);
  const supplier = findById(db.suppliers, patch.supplierId ?? existing.supplierId);

  const updated: Purchase = {
    ...existing,
    ...patch,
    lines,
    supplierName: supplier?.name ?? existing.supplierName,
    subtotal,
    taxAmount,
    total,
    paid: round2(Math.min(Math.max(patch.paid ?? existing.paid, 0), total)),
    status: patch.status ?? existing.status,
  };
  return { ...db, purchases: upsert(db.purchases, updated) };
}

export function setPurchaseStatus(db: Database, id: ID, status: PurchaseStatus): Database {
  return updatePurchase(db, id, { status });
}

/**
 * Receives stock for a purchase order. When `receipts` is omitted every
 * remaining quantity is received.
 */
export function receivePurchase(
  db: Database,
  id: ID,
  receipts: Record<ID, number> | undefined,
  actor: Actor,
): Database {
  const purchase = findById(db.purchases, id);
  if (!purchase || purchase.status === 'cancelled' || purchase.status === 'received') return db;

  let next = db;
  const lines = purchase.lines.map((line) => {
    const remaining = line.quantity - line.receivedQty;
    const quantity = receipts ? Math.min(Math.max(Math.floor(receipts[line.id] ?? 0), 0), remaining) : remaining;
    if (quantity <= 0) return line;
    next = applyStockChange(next, line.productId, quantity, {
      type: 'purchase',
      actor,
      reference: purchase.number,
      reason: purchase.supplierName,
    });
    // The latest purchase cost becomes the reference cost of the product.
    const product = findById(next.products, line.productId);
    if (product) {
      next = { ...next, products: upsert(next.products, { ...product, cost: line.unitCost, updatedAt: nowISO() }) };
    }
    return { ...line, receivedQty: line.receivedQty + quantity };
  });

  const fullyReceived = lines.every((line) => line.receivedQty >= line.quantity);
  const updated: Purchase = {
    ...purchase,
    lines,
    status: fullyReceived ? 'received' : purchase.status,
    receivedDate: nowISO(),
  };
  return { ...next, purchases: upsert(next.purchases, updated) };
}

export function payPurchase(db: Database, id: ID, amount: number): Database {
  const purchase = findById(db.purchases, id);
  if (!purchase) return db;
  const value = round2(Math.min(Math.max(amount, 0), purchase.total - purchase.paid));
  if (value <= 0) return db;
  const supplier = findById(db.suppliers, purchase.supplierId);
  let next: Database = {
    ...db,
    purchases: upsert(db.purchases, { ...purchase, paid: round2(purchase.paid + value) }),
  };
  if (supplier) {
    next = { ...next, suppliers: upsert(next.suppliers, { ...supplier, balance: round2(supplier.balance - value) }) };
  }
  return next;
}

export function deletePurchase(db: Database, id: ID): Database {
  return { ...db, purchases: removeById(db.purchases, id) };
}


